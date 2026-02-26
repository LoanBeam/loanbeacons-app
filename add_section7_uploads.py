"""
add_section7_uploads.py
Adds Section 7 — Document Uploads to LenderIntakeForm.jsx
Adds Firebase Storage imports, upload state, upload UI, and storage write logic.
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

import sys

path = "src/modules/LenderIntakeForm.jsx"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

original = c

# ── CHANGE 1: Add Firebase Storage import ──────────────────────────────────
old1 = 'import { db } from "../firebase/config";'
new1 = '''import { db, storage } from "../firebase/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";'''

if old1 not in c:
    print("ERROR: Could not find firebase/config import.")
    sys.exit(1)

c = c.replace(old1, new1, 1)
print("✓ Change 1: Added Firebase Storage import")


# ── CHANGE 2: Add upload state after existing state declarations ────────────
old2 = '  const [submitting, setSubmitting] = useState(false);'
new2 = '''  const [submitting, setSubmitting] = useState(false);
  const [uploads, setUploads] = useState({});        // { fieldKey: { file, progress, url, error } }
  const [uploading, setUploading] = useState(false);'''

if old2 not in c:
    print("ERROR: Could not find submitting useState.")
    sys.exit(1)

c = c.replace(old2, new2, 1)
print("✓ Change 2: Added upload state")


# ── CHANGE 3: Add upload handler before handleSubmit ───────────────────────
old3 = '  const handleSubmit = async () => {'
new3 = '''  const handleUploadFile = async (fieldKey, file) => {
    if (!file) return;
    setUploads((prev) => ({ ...prev, [fieldKey]: { file, progress: 0, url: null, error: null } }));
    const storageRef = ref(storage, `lenderIntake/${Date.now()}_${fieldKey}_${file.name}`);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setUploads((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], progress: pct } }));
      },
      (err) => {
        setUploads((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], error: "Upload failed. Try again." } }));
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setUploads((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], url, progress: 100 } }));
        setFormData((prev) => ({ ...prev, [`${fieldKey}_url`]: url, [`${fieldKey}_filename`]: file.name }));
      }
    );
  };

  const handleSubmit = async () => {'''

if old3 not in c:
    print("ERROR: Could not find handleSubmit function.")
    sys.exit(1)

c = c.replace(old3, new3, 1)
print("✓ Change 3: Added upload handler")


# ── CHANGE 4: Add Section 7 step to each lender type step array ─────────────
old4 = "    if (type === 'conventional') return ['type', 'basic_info', 'core_qual', 'overlays', 'niches_conv', 'comp_conv', 'operations', 'submission'];"
new4 = "    if (type === 'conventional') return ['type', 'basic_info', 'core_qual', 'overlays', 'niches_conv', 'comp_conv', 'operations', 'doc_uploads', 'submission'];"

if old4 not in c:
    print("ERROR: Could not find conventional steps array.")
    sys.exit(1)
c = c.replace(old4, new4, 1)

old5 = "    if (type === 'nonqm') return ['type', 'basic_info', 'core_qual_nqm', 'products', 'niches_nqm', 'comp_nqm', 'operations', 'submission'];"
new5 = "    if (type === 'nonqm') return ['type', 'basic_info', 'core_qual_nqm', 'products', 'niches_nqm', 'comp_nqm', 'operations', 'doc_uploads', 'submission'];"

if old5 not in c:
    print("ERROR: Could not find nonqm steps array.")
    sys.exit(1)
c = c.replace(old5, new5, 1)

old6 = "    if (type === 'hard_money') return ['type', 'basic_info', 'core_qual_hm', 'rehab', 'niches_hm', 'comp_hm', 'deal_prefs', 'operations', 'submission'];"
new6 = "    if (type === 'hard_money') return ['type', 'basic_info', 'core_qual_hm', 'rehab', 'niches_hm', 'comp_hm', 'deal_prefs', 'operations', 'doc_uploads', 'submission'];"

if old6 not in c:
    print("ERROR: Could not find hard_money steps array.")
    sys.exit(1)
c = c.replace(old6, new6, 1)
print("✓ Change 4: Added doc_uploads step to all three lender type flows")


# ── CHANGE 5: Add Section 7 UI before the submission review step ────────────
old7 = "        {/* STEP: SUBMISSION REVIEW */}\n        {currentStep === steps.length - 1 && ("
new7 = '''        {/* STEP: DOCUMENT UPLOADS */}
        {steps[currentStep] === "doc_uploads" && (
          <FormSection title="Section 7 — Document Uploads" subtitle="Upload your current guidelines, rate sheets, and templates. All documents are stored securely and tied to your lender profile.">

            {/* Universal uploads */}
            <SectionSubhead>All Lender Types</SectionSubhead>
            <UploadField
              label="Rate Sheet / Pricing Matrix"
              fieldKey="rateSheet"
              note="Current points and pricing tiers — PDF or Excel"
              uploads={uploads}
              onUpload={handleUploadFile}
            />
            <UploadField
              label="Full Guidelines Document"
              fieldKey="guidelines"
              note="Your complete underwriting guidelines — PDF"
              uploads={uploads}
              onUpload={handleUploadFile}
            />
            <UploadField
              label="Product Flyer / One-Pager"
              fieldKey="productFlyer"
              note="LO-facing summary of your products — PDF"
              uploads={uploads}
              onUpload={handleUploadFile}
            />
            <UploadField
              label="Broker Agreement Template"
              fieldKey="brokerAgreement"
              note="Standard broker agreement for new approvals — PDF"
              uploads={uploads}
              onUpload={handleUploadFile}
            />

            {/* Hard money specific */}
            {formData.lenderType === "hard_money" && (
              <>
                <SectionSubhead>Hard Money / Bridge Specific</SectionSubhead>
                <UploadField
                  label="Draw Schedule Template"
                  fieldKey="drawScheduleTemplate"
                  note="How draws are structured and requested — PDF or Excel"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
                <UploadField
                  label="Rehab Budget Template"
                  fieldKey="rehabBudgetTemplate"
                  note="The form or spreadsheet you require for rehab bids"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
                <UploadField
                  label="Sample Term Sheet"
                  fieldKey="sampleTermSheet"
                  note="Example term sheet so LOs know what to expect — PDF"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
              </>
            )}

            {/* Conventional specific */}
            {formData.lenderType === "conventional" && (
              <>
                <SectionSubhead>Conventional / Agency Specific</SectionSubhead>
                <UploadField
                  label="LLPA / Pricing Adjustment Matrix"
                  fieldKey="llpaMatrix"
                  note="Loan level price adjustment grid — PDF or Excel"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
                <UploadField
                  label="Overlay Matrix"
                  fieldKey="overlayMatrix"
                  note="Summary of your overlays vs. agency guidelines"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
              </>
            )}

            {/* Non-QM specific */}
            {formData.lenderType === "nonqm" && (
              <>
                <SectionSubhead>Non-QM Specific</SectionSubhead>
                <UploadField
                  label="Product Matrix"
                  fieldKey="productMatrix"
                  note="All Non-QM products with LTV, FICO, and doc type by product"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
                <UploadField
                  label="Bank Statement Guidelines"
                  fieldKey="bankStatementGuidelines"
                  note="Specific bank statement underwriting guidelines — PDF"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
                <UploadField
                  label="DSCR Guidelines"
                  fieldKey="dscrGuidelines"
                  note="DSCR product-specific guidelines — PDF"
                  uploads={uploads}
                  onUpload={handleUploadFile}
                />
              </>
            )}

            <div style={{ marginTop: "20px", padding: "12px 16px", background: "#1a1f2e", borderRadius: "8px", border: "1px solid #1e2535", color: "#475569", fontSize: "11px", lineHeight: "1.6" }}>
              All documents are stored securely in LoanBeacons private storage. They are only accessible to verified LOs on the platform and platform administrators. Documents are never shared publicly. You can update any document at any time by resubmitting this form.
            </div>
          </FormSection>
        )}

        {/* STEP: SUBMISSION REVIEW */}
        {currentStep === steps.length - 1 && ('''

if "        {/* STEP: SUBMISSION REVIEW */}\n        {currentStep === steps.length - 1 && (" not in c:
    print("ERROR: Could not find submission review step.")
    sys.exit(1)

c = c.replace(
    "        {/* STEP: SUBMISSION REVIEW */}\n        {currentStep === steps.length - 1 && (",
    new7,
    1
)
print("✓ Change 5: Added Section 7 document uploads UI")


# ── CHANGE 6: Add UploadField component before styles ───────────────────────
old8 = "// ── STYLES ─────────────────────────────────────────────────────────────────"
new8 = '''// ── UPLOAD FIELD COMPONENT ───────────────────────────────────────────────────

const UploadField = ({ label, fieldKey, note, uploads, onUpload }) => {
  const upload = uploads[fieldKey];
  const hasFile = upload?.file;
  const isUploading = hasFile && upload.progress < 100 && !upload.error;
  const isDone = upload?.url;
  const hasError = upload?.error;

  return (
    <div style={{ marginBottom: "16px", background: "#1a1f2e", border: `1px solid ${isDone ? "#10b98144" : "#2d3548"}`, borderRadius: "8px", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <div>
          <div style={{ color: isDone ? "#10b981" : "#f1f5f9", fontSize: "13px", fontWeight: "600" }}>
            {isDone ? "✓ " : ""}{label}
          </div>
          {note && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>{note}</div>}
        </div>
        <label style={{ cursor: "pointer" }}>
          <input
            type="file"
            accept=".pdf,.xlsx,.xls,.doc,.docx"
            style={{ display: "none" }}
            onChange={(e) => { if (e.target.files[0]) onUpload(fieldKey, e.target.files[0]); }}
          />
          <span style={{ background: isDone ? "#10b98122" : "#e8531a22", border: `1px solid ${isDone ? "#10b98155" : "#e8531a55"}`, color: isDone ? "#10b981" : "#e8531a", fontSize: "11px", fontWeight: "600", padding: "5px 14px", borderRadius: "6px" }}>
            {isDone ? "Replace" : "Upload"}
          </span>
        </label>
      </div>

      {isUploading && (
        <div style={{ marginTop: "8px" }}>
          <div style={{ background: "#2d3548", borderRadius: "4px", height: "4px", overflow: "hidden" }}>
            <div style={{ background: "#e8531a", height: "100%", width: `${upload.progress}%`, transition: "width 0.2s" }} />
          </div>
          <div style={{ color: "#64748b", fontSize: "10px", marginTop: "4px" }}>{upload.progress}% uploaded</div>
        </div>
      )}

      {isDone && (
        <div style={{ color: "#64748b", fontSize: "11px", marginTop: "6px" }}>
          {upload.file.name} · <a href={upload.url} target="_blank" rel="noreferrer" style={{ color: "#e8531a" }}>Preview</a>
        </div>
      )}

      {hasError && (
        <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "6px" }}>{upload.error}</div>
      )}
    </div>
  );
};


// ── STYLES ─────────────────────────────────────────────────────────────────'''

if old8 not in c:
    print("ERROR: Could not find STYLES section.")
    sys.exit(1)

c = c.replace(old8, new8, 1)
print("✓ Change 6: Added UploadField component")


# ── WRITE ────────────────────────────────────────────────────────────────────
if c == original:
    print("\nWARNING: No changes were made.")
    sys.exit(1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("\n✅ Section 7 added to LenderIntakeForm.jsx successfully.")
print("   NOTE: Make sure Firebase Storage is enabled in your Firebase console.")
print("   Also add 'storage' to your firebase/config.js exports if not already there.")
