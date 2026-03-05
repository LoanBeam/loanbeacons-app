// ============================================================
//  src/modules/DecisionRecord.jsx
//  LoanBeacons — Decision Record Module 21
//  The backbone audit module. Three-lane architecture.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';

import {
  getOrCreateRecord,
  getRecordsByScenario,
  saveLONotes,
  saveFinalDisposition,
  attestRecord,
  initiateRecordLock,
  createNewVersion,
  addManagerComment,
  markManagerReviewed,
  toggleManagerFlag,
  syncRecordHeader,
} from '../services/decisionRecordService';
import {
  RECORD_STATUS,
  FLAG_SEVERITY,
  DISPOSITION_OPTIONS,
  CHANGE_REASONS,
  LO_NOTE_TAGS,
  COMPLETENESS_THRESHOLDS,
} from '../constants/decisionRecordConstants';

// ─────────────────────────────────────────────────────────────
//  STYLE CONSTANTS
// ─────────────────────────────────────────────────────────────
const C = {
  navy:'#0B1C2D', navyLight:'#112436', navyMid:'#1A3050', navyBorder:'#1E3A54',
  gold:'#C9A84C', white:'#F0F4F8', whiteDim:'#A8B8C8',
  critical:'#E05555', critBg:'#2A1515', warning:'#E09A30', warnBg:'#2A2010',
  info:'#4A90D9', infoBg:'#0F2035', success:'#4CAF7D', succBg:'#0F2820',
};

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────
const fmt = v => (v===null||v===undefined||v==='') ? '—' : String(v);
const fmtDate = ts => {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  } catch { return '—'; }
};
const MODULE_LABELS = {
  scenario_creator:'Scenario Creator',income_analysis:'Income Analysis',asset_review:'Asset Review',
  credit_analysis:'Credit Analysis',property_analysis:'Property Analysis',lender_match:'Lender Match™',
  program_eligibility:'Program Eligibility',aus_rescue:'AUS Rescue™',non_qm_pathways:'Non-QM Pathways',
  dpa_eligibility:'DPA Eligibility',lender_profile_builder:'Lender Profile Builder',
  cra_intelligence:'CRA Intelligence',rate_scenario:'Rate Scenario',
  closing_cost_estimator:'Closing Cost Estimator',cash_to_close:'Cash to Close',
  rehab_intelligence:'Rehab Intelligence™',document_checklist:'Document Checklist',
  compliance_review:'Compliance Review',ae_share_service:'AE Share Service',
  submission_package:'Submission Package',decision_record:'Decision Record',
};
const modLabel  = k => MODULE_LABELS[k]||k;
const sevColor  = s => s===FLAG_SEVERITY.CRITICAL?C.critical:s===FLAG_SEVERITY.WARNING?C.warning:C.info;
const sevBg     = s => s===FLAG_SEVERITY.CRITICAL?C.critBg:s===FLAG_SEVERITY.WARNING?C.warnBg:C.infoBg;
const statColor = s => s===RECORD_STATUS.LOCKED?C.success:s===RECORD_STATUS.LOCKING?C.info:C.gold;
const statLabel = s => s===RECORD_STATUS.LOCKED?'🔒 LOCKED':s===RECORD_STATUS.LOCKING?'⏳ LOCKING...':'✏️ DRAFT';

// ─────────────────────────────────────────────────────────────
//  SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────
function StatusBadge({status}) {
  return <span style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 14px',borderRadius:20,background:`${statColor(status)}22`,border:`1px solid ${statColor(status)}`,color:statColor(status),fontSize:12,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>{statLabel(status)}</span>;
}
function SecHead({title,icon,sub,right}) {
  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${C.navyBorder}`,paddingBottom:12,marginBottom:18}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        {icon&&<span style={{fontSize:18}}>{icon}</span>}
        <div>
          <div style={{color:C.gold,fontWeight:700,fontSize:13,letterSpacing:'0.1em',textTransform:'uppercase'}}>{title}</div>
          {sub&&<div style={{color:C.whiteDim,fontSize:11,marginTop:2}}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}
function Chip({label,color=C.gold}) {
  return <span style={{background:`${color}22`,border:`1px solid ${color}`,color,fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</span>;
}

// ── Risk Flag Bar ─────────────────────────────────────────────
function RiskFlagBar({flags=[]}) {
  const [open,setOpen]=useState(false);
  const crits=flags.filter(f=>f.severity===FLAG_SEVERITY.CRITICAL);
  const warns=flags.filter(f=>f.severity===FLAG_SEVERITY.WARNING);
  const infos=flags.filter(f=>f.severity===FLAG_SEVERITY.INFO);
  if (!flags.length) return (
    <div style={{background:C.succBg,border:`1px solid ${C.success}`,borderRadius:8,padding:'10px 16px',marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
      <span>✅</span><span style={{color:C.success,fontSize:13,fontWeight:600}}>No risk flags — clean record</span>
    </div>
  );
  const topColor=crits.length?C.critical:C.warning;
  const topBg=crits.length?C.critBg:C.warnBg;
  return (
    <div style={{marginBottom:20}}>
      <div onClick={()=>setOpen(o=>!o)} style={{background:topBg,border:`1px solid ${topColor}`,borderRadius:open?'8px 8px 0 0':8,padding:'10px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <span>⚑</span>
          <span style={{color:C.white,fontSize:13,fontWeight:700}}>{flags.length} Risk Flag{flags.length!==1?'s':''}</span>
          {crits.length>0&&<Chip color={C.critical} label={`${crits.length} Critical`}/>}
          {warns.length>0&&<Chip color={C.warning} label={`${warns.length} Warning`}/>}
          {infos.length>0&&<Chip color={C.info} label={`${infos.length} Info`}/>}
        </div>
        <span style={{color:C.whiteDim,fontSize:12}}>{open?'▲':'▼'}</span>
      </div>
      {open&&(
        <div style={{background:C.navyLight,border:`1px solid ${topColor}`,borderTop:'none',borderRadius:'0 0 8px 8px',padding:'12px 16px'}}>
          {flags.map((f,i)=>(
            <div key={i} style={{display:'flex',alignItems:'flex-start',gap:12,padding:'8px 0',borderBottom:i<flags.length-1?`1px solid ${C.navyBorder}`:'none'}}>
              <span style={{background:sevBg(f.severity),border:`1px solid ${sevColor(f.severity)}`,color:sevColor(f.severity),fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,textTransform:'uppercase',whiteSpace:'nowrap',marginTop:2}}>{f.severity}</span>
              <div style={{flex:1}}>
                <div style={{color:C.white,fontSize:12,fontWeight:600}}>{f.flag_code?.replace(/_/g,' ').toUpperCase()} <span style={{color:C.whiteDim,fontWeight:400}}>[{modLabel(f.source_module)}]</span></div>
                {f.detail&&<div style={{color:C.whiteDim,fontSize:11,marginTop:3}}>{f.detail}</div>}
              </div>
              <div style={{color:C.whiteDim,fontSize:10,whiteSpace:'nowrap'}}>{fmtDate(f.flagged_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Completeness Meter ────────────────────────────────────────
function CompletenessMeter({score=0,missing=[]}) {
  const [show,setShow]=useState(false);
  const pct=Math.round(score*100);
  const bar=score>=COMPLETENESS_THRESHOLDS.GOOD?C.success:score>=COMPLETENESS_THRESHOLDS.MODERATE?C.warning:C.critical;
  return (
    <div style={{marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,alignItems:'center'}}>
        <span style={{color:C.whiteDim,fontSize:12,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase'}}>Module Completeness</span>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{color:bar,fontSize:14,fontWeight:700}}>{pct}%</span>
          {missing.length>0&&<button onClick={()=>setShow(s=>!s)} style={{background:'none',border:`1px solid ${C.navyBorder}`,color:C.whiteDim,fontSize:10,padding:'2px 8px',borderRadius:4,cursor:'pointer'}}>{missing.length} missing {show?'▲':'▼'}</button>}
        </div>
      </div>
      <div style={{background:C.navyMid,borderRadius:6,height:8,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:`linear-gradient(90deg,${bar}88,${bar})`,borderRadius:6,transition:'width 0.6s ease'}}/>
      </div>
      {show&&missing.length>0&&(
        <div style={{marginTop:8,background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:6,padding:'8px 12px',display:'flex',flexWrap:'wrap',gap:6}}>
          {missing.map(m=><span key={m} style={{background:C.navyMid,color:C.whiteDim,fontSize:10,padding:'2px 8px',borderRadius:4,border:`1px solid ${C.navyBorder}`}}>{modLabel(m)}</span>)}
        </div>
      )}
    </div>
  );
}

// ── Module Finding Card ───────────────────────────────────────
function ModuleFindingCard({moduleKey,findings}) {
  const [open,setOpen]=useState(false);
  const skip=['reported_at','module_version'];
  const entries=Object.entries(findings).filter(([k])=>!skip.includes(k));
  const rv=v=>{
    if (v===null||v===undefined) return '—';
    if (typeof v==='boolean') return v?'Yes':'No';
    if (typeof v==='object'&&v.toDate) return fmtDate(v);
    if (typeof v==='object') return JSON.stringify(v);
    return String(v);
  };
  return (
    <div style={{background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:8,marginBottom:8,overflow:'hidden'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:'12px 16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:8,height:8,borderRadius:'50%',background:C.success,display:'inline-block'}}/>
          <span style={{color:C.white,fontSize:13,fontWeight:600}}>{modLabel(moduleKey)}</span>
          {findings.module_version&&<span style={{color:C.whiteDim,fontSize:10}}>v{findings.module_version}</span>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {findings.reported_at&&<span style={{color:C.whiteDim,fontSize:10}}>{fmtDate(findings.reported_at)}</span>}
          <span style={{color:C.whiteDim,fontSize:12}}>{open?'▲':'▼'}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:'12px 16px 16px',borderTop:`1px solid ${C.navyBorder}`,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 24px'}}>
          {entries.map(([k,v])=>(
            <div key={k}>
              <div style={{color:C.whiteDim,fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>{k.replace(/_/g,' ')}</div>
              <div style={{color:C.white,fontSize:12}}>{rv(v)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Evidence Locker ───────────────────────────────────────────
function EvidenceLocker({evidence=[]}) {
  const [open,setOpen]=useState(false);
  if (!evidence.length) return <div style={{background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'12px 16px',color:C.whiteDim,fontSize:12,textAlign:'center'}}>No evidence attached yet</div>;
  return (
    <div style={{background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:8,overflow:'hidden'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:'12px 16px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{color:C.white,fontSize:13,fontWeight:600}}>{evidence.length} Evidence Item{evidence.length!==1?'s':''} Attached</span>
        <span style={{color:C.whiteDim,fontSize:12}}>{open?'▲':'▼'}</span>
      </div>
      {open&&evidence.map((e,i)=>(
        <div key={i} style={{padding:'10px 16px',borderTop:`1px solid ${C.navyBorder}`,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
          <div><div style={{color:C.whiteDim,fontSize:10,textTransform:'uppercase',marginBottom:2}}>Type</div><div style={{color:C.white,fontSize:11}}>{fmt(e.type)}</div></div>
          <div><div style={{color:C.whiteDim,fontSize:10,textTransform:'uppercase',marginBottom:2}}>Source</div><div style={{color:C.white,fontSize:11}}>{fmt(e.source_name)}</div></div>
          <div><div style={{color:C.whiteDim,fontSize:10,textTransform:'uppercase',marginBottom:2}}>Retrieved</div><div style={{color:C.white,fontSize:11}}>{fmtDate(e.retrieved_at)}</div></div>
        </div>
      ))}
    </div>
  );
}

// ── Version History ───────────────────────────────────────────
function VersionHistory({versions=[],currentId}) {
  if (versions.length<=1) return null;
  return (
    <div style={{marginBottom:24}}>
      <SecHead title="Version History" icon="🔗"/>
      {versions.map(v=>(
        <div key={v.recordId} style={{background:v.recordId===currentId?`${C.gold}15`:C.navyLight,border:`1px solid ${v.recordId===currentId?C.gold:C.navyBorder}`,borderRadius:8,padding:'10px 16px',marginBottom:6,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{color:C.gold,fontSize:12,fontWeight:700}}>v{v.record_version}</span>
            <StatusBadge status={v.status}/>
            {v.change_reason&&<span style={{color:C.whiteDim,fontSize:11}}>— {v.change_reason}</span>}
            {v.recordId===currentId&&<Chip label="CURRENT"/>}
          </div>
          <span style={{color:C.whiteDim,fontSize:10}}>{fmtDate(v.header?.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
export default function DecisionRecord({scenarioId:propScenarioId, scenarioData={}, isManager=false}) {
  const params     = useParams();
  const scenarioId = propScenarioId || params.scenarioId;
  

  const [record,setRecord]             = useState(null);
  const [versions,setVersions]         = useState([]);
  const [loading,setLoading]           = useState(true);
  const [error,setError]               = useState(null);
  const [saving,setSaving]             = useState(false);
  const [locking,setLocking]           = useState(false);
  const [versioning,setVersioning]     = useState(false);
  const [attesting,setAttesting]       = useState(false);
  const [activeTab,setActiveTab]       = useState('findings');
  const [loText,setLoText]             = useState('');
  const [loTags,setLoTags]             = useState([]);
  const [notesDirty,setNotesDirty]     = useState(false);
  const [disposition,setDisposition]   = useState('');
  const [programSel,setProgramSel]     = useState('');
  const [lenderSel,setLenderSel]       = useState('');
  const [dispDirty,setDispDirty]       = useState(false);
  const [showVDlg,setShowVDlg]         = useState(false);
  const [changeReason,setChangeReason] = useState('');
  const [crOther,setCROther]           = useState('');
  const [mgrComment,setMgrComment]     = useState('');
  const [submMgr,setSubmMgr]           = useState(false);

  const load = useCallback(async()=>{
    if (!scenarioId||!'default') return;
    try {
      setLoading(true); setError(null);
      const r = await getOrCreateRecord(scenarioId, 'default', scenarioData);
      setRecord(r);
      if (r.recordId&&r.status===RECORD_STATUS.DRAFT) await syncRecordHeader(r.recordId,scenarioData);
      if (r.lo_notes?.text) setLoText(r.lo_notes.text);
      if (r.lo_notes?.tags) setLoTags(r.lo_notes.tags);
      const dr=r.system_findings?.decision_record;
      if (dr?.disposition)      setDisposition(dr.disposition);
      if (dr?.program_selected) setProgramSel(dr.program_selected);
      if (dr?.lender_selected)  setLenderSel(dr.lender_selected);
      setVersions(await getRecordsByScenario(scenarioId));
    } catch(e){ setError(e.message); } finally { setLoading(false); }
  },[scenarioId,'default']);

  useEffect(()=>{ load(); },[load]);

  const handleSaveNotes=async()=>{
    if (!record?.recordId) return; setSaving(true);
    try { await saveLONotes(record.recordId,loText,loTags); setNotesDirty(false); await load(); }
    catch(e){ setError(e.message); } finally { setSaving(false); }
  };
  const handleSaveDisp=async()=>{
    if (!record?.recordId||!disposition) return; setSaving(true);
    try { await saveFinalDisposition(record.recordId,'default',{disposition,programSelected:programSel,lenderSelected:lenderSel}); setDispDirty(false); await load(); }
    catch(e){ setError(e.message); } finally { setSaving(false); }
  };
  const handleAttest=async()=>{
    if (!record?.recordId) return; setAttesting(true);
    try { await attestRecord(record.recordId,'default'); await load(); }
    catch(e){ setError(e.message); } finally { setAttesting(false); }
  };
  const handleLock=async()=>{
    if (!record?.recordId) return;
    if (!window.confirm('Lock this Decision Record? This is permanent and cannot be undone.')) return;
    setLocking(true);
    try { await initiateRecordLock(record.recordId,'default'); await load(); }
    catch(e){ setError(e.message); } finally { setLocking(false); }
  };
  const handleCreateVersion=async()=>{
    if (!record?.recordId||!changeReason) return;
    const reason=changeReason==='Other — explanation required'?`Other: ${crOther}`:changeReason;
    setVersioning(true);
    try { await createNewVersion(record.recordId,'default',reason); setShowVDlg(false); setChangeReason(''); setCROther(''); await load(); }
    catch(e){ setError(e.message); } finally { setVersioning(false); }
  };
  const handleMgrComment=async()=>{
    if (!record?.recordId||!mgrComment.trim()) return; setSubmMgr(true);
    try { await addManagerComment(record.recordId,'default',mgrComment.trim()); setMgrComment(''); await load(); }
    catch(e){ setError(e.message); } finally { setSubmMgr(false); }
  };
  const handleMgrReviewed=async()=>{ try { await markManagerReviewed(record.recordId,'default'); await load(); } catch(e){ setError(e.message); }};
  const handleToggleFlag=async(f)=>{ try { await toggleManagerFlag(record.recordId,f); await load(); } catch(e){ setError(e.message); }};
  const toggleTag=tag=>{ setLoTags(p=>p.includes(tag)?p.filter(t=>t!==tag):[...p,tag]); setNotesDirty(true); };

  const isDraft=record?.status===RECORD_STATUS.DRAFT;
  const isLocked=record?.status===RECORD_STATUS.LOCKED;
  const isLockingNow=record?.status===RECORD_STATUS.LOCKING;
  const isAttested=record?.lo_attestation?.certified===true;
  const hasDisp=!!record?.system_findings?.decision_record?.disposition;
  const canLock=isDraft&&isAttested&&hasDisp;
  const findings=record?.system_findings||{};
  const riskFlags=record?.risk_flags||[];
  const evidence=record?.evidence||[];
  const score=record?.completeness_score??0;
  const missing=record?.missing_modules||[];
  const review=record?.manager_review||{};

  if (loading) return (
    <div style={{background:C.navy,borderRadius:12,padding:40,display:'flex',alignItems:'center',justifyContent:'center',minHeight:300}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:40,height:40,border:`3px solid ${C.navyBorder}`,borderTopColor:C.gold,borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 16px'}}/>
        <div style={{color:C.whiteDim,fontSize:13}}>Loading Decision Record...</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{background:C.critBg,border:`1px solid ${C.critical}`,borderRadius:12,padding:24,color:C.critical}}>
      <div style={{fontWeight:700,marginBottom:8}}>Error loading Decision Record</div>
      <div style={{fontSize:12,fontFamily:'monospace'}}>{error}</div>
      <button onClick={load} style={{marginTop:16,background:`${C.critical}22`,border:`1px solid ${C.critical}`,color:C.critical,padding:'8px 16px',borderRadius:6,cursor:'pointer',fontSize:12}}>Retry</button>
    </div>
  );

  if (!record) return null;

  return (
    <div style={{background:C.navy,borderRadius:12,border:`1px solid ${C.navyBorder}`,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:C.white,overflow:'hidden'}}>

      {/* HEADER */}
      <div style={{background:`linear-gradient(135deg,${C.navyMid} 0%,${C.navy} 100%)`,borderBottom:`1px solid ${C.navyBorder}`,padding:'20px 24px'}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
              <span style={{color:C.gold,fontWeight:800,fontSize:11,letterSpacing:'0.15em',textTransform:'uppercase'}}>Module 21</span>
              <span style={{color:C.navyBorder}}>·</span>
              <span style={{color:C.whiteDim,fontSize:11}}>Decision Record™</span>
              <span style={{color:C.navyBorder}}>·</span>
              <span style={{color:C.whiteDim,fontSize:11}}>v{record.record_version||1}</span>
            </div>
            <h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.white}}>
              {record.header?.borrowerName?`${record.header.borrowerName} — ${record.header?.loanType||'Loan'}`:'Decision Record'}
            </h2>
            {record.header?.propertyAddress&&<div style={{color:C.whiteDim,fontSize:12,marginTop:4}}>{record.header.propertyAddress}</div>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <StatusBadge status={record.status}/>
            {isLocked&&record.record_hash&&(
              <div style={{background:`${C.success}15`,border:`1px solid ${C.success}33`,borderRadius:6,padding:'4px 10px',fontFamily:'monospace',fontSize:10,color:C.success}}>
                SHA-256: {record.record_hash.substring(0,16)}...
              </div>
            )}
            {isLocked&&<button onClick={()=>setShowVDlg(true)} style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,color:C.gold,fontSize:11,fontWeight:700,padding:'6px 14px',borderRadius:6,cursor:'pointer'}}>+ New Version</button>}
          </div>
        </div>
        <div style={{display:'flex',gap:24,marginTop:16,flexWrap:'wrap',paddingTop:14,borderTop:`1px solid ${C.navyBorder}`}}>
          {[
            {label:'LO',value:record.header?.loName},
            {label:'Scenario',value:record.scenarioId?.substring(0,10)+'...'},
            {label:'Created',value:fmtDate(record.header?.createdAt)},
            {label:'Updated',value:fmtDate(record.header?.updatedAt)},
            isLocked&&{label:'Locked',value:fmtDate(record.locked_at)},
          ].filter(Boolean).map(({label,value})=>(
            <div key={label}>
              <div style={{color:C.whiteDim,fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:2}}>{label}</div>
              <div style={{color:C.white,fontSize:12,fontWeight:600}}>{fmt(value)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RISK FLAGS + COMPLETENESS */}
      <div style={{padding:'20px 24px 0'}}>
        <RiskFlagBar flags={riskFlags}/>
        <CompletenessMeter score={score} missing={missing}/>
      </div>

      {/* TABS */}
      <div style={{display:'flex',borderBottom:`1px solid ${C.navyBorder}`,padding:'0 24px'}}>
        {[
          {key:'findings',label:'📊 System Findings',count:Object.keys(findings).length},
          {key:'notes',label:'✏️ LO Notes & Disposition'},
          {key:'evidence',label:'🗂 Evidence Locker',count:evidence.length},
          isManager&&{key:'manager',label:'🏛 Manager Review'},
        ].filter(Boolean).map(tab=>(
          <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{background:'none',border:'none',borderBottom:`2px solid ${activeTab===tab.key?C.gold:'transparent'}`,color:activeTab===tab.key?C.gold:C.whiteDim,fontSize:12,fontWeight:activeTab===tab.key?700:500,padding:'14px 18px',cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:6}}>
            {tab.label}
            {tab.count>0&&<span style={{background:activeTab===tab.key?`${C.gold}33`:C.navyMid,color:activeTab===tab.key?C.gold:C.whiteDim,fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:10}}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div style={{padding:24}}>

        {/* FINDINGS TAB */}
        {activeTab==='findings'&&(
          <div>
            <SecHead title="System Findings" icon="📊" sub="Auto-generated by each module — read only"/>
            <VersionHistory versions={versions} currentId={record.recordId}/>
            {!Object.keys(findings).length ? (
              <div style={{background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:32,textAlign:'center',color:C.whiteDim,fontSize:13}}>
                No module findings yet. Run scenarios through any module to populate this record.
              </div>
            ) : Object.entries(findings).map(([k,v])=>(
              <ModuleFindingCard key={k} moduleKey={k} findings={v}/>
            ))}
          </div>
        )}

        {/* NOTES & DISPOSITION TAB */}
        {activeTab==='notes'&&(
          <div>
            <div style={{marginBottom:28}}>
              <SecHead title="Final Disposition" icon="⚖️" sub="LO's official decision on this loan path"/>
              {isLocked ? (
                <div style={{background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16}}>
                  {[
                    {label:'Decision',value:record.system_findings?.decision_record?.disposition},
                    {label:'Program Selected',value:record.system_findings?.decision_record?.program_selected},
                    {label:'Lender Selected',value:record.system_findings?.decision_record?.lender_selected},
                  ].map(({label,value})=>(
                    <div key={label}>
                      <div style={{color:C.whiteDim,fontSize:10,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{label}</div>
                      <div style={{color:C.white,fontSize:14,fontWeight:700}}>{fmt(value)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div>
                    <label style={{color:C.whiteDim,fontSize:11,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Decision *</label>
                    <select value={disposition} onChange={e=>{setDisposition(e.target.value);setDispDirty(true);}} style={{width:'100%',background:C.navyMid,border:`1px solid ${disposition?C.gold:C.navyBorder}`,borderRadius:8,padding:'10px 14px',color:disposition?C.white:C.whiteDim,fontSize:13,outline:'none'}}>
                      <option value="">Select disposition...</option>
                      {DISPOSITION_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                    {[
                      {label:'Program Selected',val:programSel,set:v=>{setProgramSel(v);setDispDirty(true);},ph:'e.g. FHA 203k, DSCR'},
                      {label:'Lender Selected',val:lenderSel,set:v=>{setLenderSel(v);setDispDirty(true);},ph:'Lender name'},
                    ].map(({label,val,set,ph})=>(
                      <div key={label}>
                        <label style={{color:C.whiteDim,fontSize:11,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>{label}</label>
                        <input value={val} onChange={e=>set(e.target.value)} placeholder={ph} style={{width:'100%',background:C.navyMid,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'10px 14px',color:C.white,fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                      </div>
                    ))}
                  </div>
                  {dispDirty&&<button onClick={handleSaveDisp} disabled={saving||!disposition} style={{alignSelf:'flex-start',background:disposition?`${C.gold}22`:C.navyMid,border:`1px solid ${disposition?C.gold:C.navyBorder}`,color:disposition?C.gold:C.whiteDim,fontSize:12,fontWeight:700,padding:'8px 20px',borderRadius:6,cursor:disposition?'pointer':'default'}}>{saving?'Saving...':'Save Disposition'}</button>}
                </div>
              )}
            </div>

            <div style={{marginBottom:28}}>
              <SecHead title="LO Notes" icon="✏️" sub="Your deal narrative — separate from system findings"/>
              {isLocked ? (
                <div style={{background:C.navyLight,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'16px 20px'}}>
                  <p style={{margin:0,color:record.lo_notes?.text?C.white:C.whiteDim,fontSize:13,lineHeight:1.6}}>{record.lo_notes?.text||'No LO notes recorded'}</p>
                  {record.lo_notes?.tags?.length>0&&<div style={{display:'flex',gap:6,marginTop:12,flexWrap:'wrap'}}>{record.lo_notes.tags.map(t=><Chip key={t} label={t.replace(/_/g,' ')}/>)}</div>}
                </div>
              ) : (
                <div>
                  <textarea value={loText} onChange={e=>{setLoText(e.target.value);setNotesDirty(true);}} placeholder="Describe the deal narrative, key factors, compensating elements..." rows={5} style={{width:'100%',background:C.navyMid,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'12px 14px',color:C.white,fontSize:13,resize:'vertical',outline:'none',lineHeight:1.6,boxSizing:'border-box'}}/>
                  <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
                    {LO_NOTE_TAGS.map(tag=>(
                      <button key={tag} onClick={()=>toggleTag(tag)} style={{background:loTags.includes(tag)?`${C.gold}22`:C.navyMid,border:`1px solid ${loTags.includes(tag)?C.gold:C.navyBorder}`,color:loTags.includes(tag)?C.gold:C.whiteDim,fontSize:10,fontWeight:loTags.includes(tag)?700:500,padding:'4px 10px',borderRadius:12,cursor:'pointer',transition:'all 0.15s'}}>{tag.replace(/_/g,' ')}</button>
                    ))}
                  </div>
                  {notesDirty&&<button onClick={handleSaveNotes} disabled={saving} style={{marginTop:12,background:`${C.gold}22`,border:`1px solid ${C.gold}`,color:C.gold,fontSize:12,fontWeight:700,padding:'8px 20px',borderRadius:6,cursor:'pointer'}}>{saving?'Saving...':'Save Notes'}</button>}
                </div>
              )}
            </div>

            {isDraft&&(
              <div style={{background:isAttested?C.succBg:C.navyLight,border:`1px solid ${isAttested?C.success:C.navyBorder}`,borderRadius:10,padding:20}}>
                <SecHead title="LO Attestation & Record Lock" icon="🔏" sub="Required before the record can be locked"/>
                {!isAttested ? (
                  <div>
                    <p style={{color:C.whiteDim,fontSize:12,lineHeight:1.6,margin:'0 0 16px'}}>By attesting, you certify this record accurately reflects the information available at the time of this loan decision, including all findings, notes, and selected program.</p>
                    <button onClick={handleAttest} disabled={attesting} style={{background:`${C.gold}22`,border:`1px solid ${C.gold}`,color:C.gold,fontSize:13,fontWeight:700,padding:'10px 24px',borderRadius:8,cursor:'pointer'}}>{attesting?'Certifying...':'✓ I Certify This Record is Accurate'}</button>
                  </div>
                ) : (
                  <div>
                    <div style={{color:C.success,fontSize:13,fontWeight:600,marginBottom:12}}>✓ Attested on {fmtDate(record.lo_attestation?.certified_at)}</div>
                    {!hasDisp&&<div style={{color:C.warning,fontSize:12,marginBottom:12}}>⚠ Save a final disposition before locking.</div>}
                    <button onClick={handleLock} disabled={locking||!canLock||isLockingNow} style={{background:canLock?`${C.critical}22`:C.navyMid,border:`1px solid ${canLock?C.critical:C.navyBorder}`,color:canLock?C.critical:C.whiteDim,fontSize:13,fontWeight:700,padding:'10px 24px',borderRadius:8,cursor:canLock?'pointer':'default',transition:'all 0.2s'}}>
                      {locking||isLockingNow?'⏳ Locking...':'🔒 Lock & Finalize Record'}
                    </button>
                  </div>
                )}
              </div>
            )}
            {isLocked&&(
              <div style={{background:C.succBg,border:`1px solid ${C.success}`,borderRadius:10,padding:20,display:'flex',alignItems:'center',gap:16}}>
                <span style={{fontSize:28}}>🔒</span>
                <div>
                  <div style={{color:C.success,fontWeight:700,fontSize:14,marginBottom:4}}>Record Locked & Tamper-Evident</div>
                  <div style={{color:C.whiteDim,fontSize:12}}>Locked {fmtDate(record.locked_at)} · SHA-256: {record.record_hash?.substring(0,32)}...</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EVIDENCE TAB */}
        {activeTab==='evidence'&&(
          <div>
            <SecHead title="Evidence Locker" icon="🗂" sub="Audit trail of all data sources and lookups"/>
            <EvidenceLocker evidence={evidence}/>
          </div>
        )}

        {/* MANAGER TAB */}
        {activeTab==='manager'&&isManager&&(
          <div>
            <SecHead title="Manager Review" icon="🏛" sub="Annotations are additive — they do not modify the record"
              right={
                <div style={{display:'flex',gap:10}}>
                  <button onClick={()=>handleToggleFlag(!review.flagged_for_followup)} style={{background:review.flagged_for_followup?`${C.warning}22`:C.navyMid,border:`1px solid ${review.flagged_for_followup?C.warning:C.navyBorder}`,color:review.flagged_for_followup?C.warning:C.whiteDim,fontSize:11,padding:'5px 12px',borderRadius:6,cursor:'pointer',fontWeight:600}}>
                    {review.flagged_for_followup?'⚑ Flagged':'⚐ Flag for Follow-Up'}
                  </button>
                  {!review.reviewed ? (
                    <button onClick={handleMgrReviewed} style={{background:`${C.success}22`,border:`1px solid ${C.success}`,color:C.success,fontSize:11,padding:'5px 12px',borderRadius:6,cursor:'pointer',fontWeight:600}}>✓ Mark Reviewed</button>
                  ) : (
                    <span style={{color:C.success,fontSize:11,display:'flex',alignItems:'center'}}>✓ Reviewed {fmtDate(review.reviewed_at)}</span>
                  )}
                </div>
              }
            />
            {review.comments?.length>0&&(
              <div style={{marginBottom:16,display:'flex',flexDirection:'column',gap:8}}>
                {review.comments.map((c,i)=>(
                  <div key={i} style={{background:C.navyMid,borderRadius:8,padding:'10px 14px',borderLeft:`3px solid ${C.gold}`}}>
                    <div style={{color:C.whiteDim,fontSize:10,marginBottom:4}}>{fmt(c.authored_by)} · {fmtDate(c.authored_at)}</div>
                    <div style={{color:C.white,fontSize:12}}>{c.text}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{display:'flex',gap:10}}>
              <textarea value={mgrComment} onChange={e=>setMgrComment(e.target.value)} placeholder="Add a manager annotation..." rows={2} style={{flex:1,background:C.navyMid,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'10px 14px',color:C.white,fontSize:12,resize:'none',outline:'none'}}/>
              <button onClick={handleMgrComment} disabled={submMgr||!mgrComment.trim()} style={{background:mgrComment.trim()?`${C.gold}22`:C.navyMid,border:`1px solid ${mgrComment.trim()?C.gold:C.navyBorder}`,color:mgrComment.trim()?C.gold:C.whiteDim,fontSize:12,fontWeight:700,padding:'0 18px',borderRadius:8,cursor:mgrComment.trim()?'pointer':'default'}}>{submMgr?'...':'Add'}</button>
            </div>
          </div>
        )}
      </div>

      {/* VERSION DIALOG */}
      {showVDlg&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div style={{background:C.navyLight,border:`1px solid ${C.gold}`,borderRadius:12,padding:28,width:480,maxWidth:'90vw'}}>
            <h3 style={{margin:'0 0 6px',color:C.gold,fontSize:16}}>Create New Version</h3>
            <p style={{color:C.whiteDim,fontSize:12,margin:'0 0 20px',lineHeight:1.6}}>Creates a new editable draft from this locked record. A change reason is required.</p>
            <label style={{color:C.whiteDim,fontSize:11,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Change Reason *</label>
            <select value={changeReason} onChange={e=>setChangeReason(e.target.value)} style={{width:'100%',background:C.navyMid,border:`1px solid ${changeReason?C.gold:C.navyBorder}`,borderRadius:8,padding:'10px 14px',color:changeReason?C.white:C.whiteDim,fontSize:13,outline:'none',marginBottom:14,boxSizing:'border-box'}}>
              <option value="">Select a reason...</option>
              {CHANGE_REASONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
            {changeReason==='Other — explanation required'&&(
              <textarea value={crOther} onChange={e=>setCROther(e.target.value)} placeholder="Explain the reason..." rows={3} style={{width:'100%',background:C.navyMid,border:`1px solid ${C.navyBorder}`,borderRadius:8,padding:'10px 14px',color:C.white,fontSize:12,resize:'none',outline:'none',marginBottom:14,boxSizing:'border-box'}}/>
            )}
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={()=>{setShowVDlg(false);setChangeReason('');setCROther('');}} style={{background:'none',border:`1px solid ${C.navyBorder}`,color:C.whiteDim,fontSize:12,padding:'8px 20px',borderRadius:6,cursor:'pointer'}}>Cancel</button>
              <button onClick={handleCreateVersion} disabled={versioning||!changeReason||(changeReason==='Other — explanation required'&&!crOther.trim())} style={{background:changeReason?`${C.gold}22`:C.navyMid,border:`1px solid ${changeReason?C.gold:C.navyBorder}`,color:changeReason?C.gold:C.whiteDim,fontSize:12,fontWeight:700,padding:'8px 20px',borderRadius:6,cursor:changeReason?'pointer':'default'}}>
                {versioning?'Creating...':'Create New Version'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}