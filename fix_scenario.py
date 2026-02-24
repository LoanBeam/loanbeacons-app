with open("src/pages/Admin.jsx", "r", encoding="utf-8") as f:
    c = f.read()

old = '''                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[["AE Name","name"],["Email","email"],["Phone","phone"]].map(([label, field]) => (
                    <div key={field}>
                      <label className="block text-xs text-slate-500 mb-1">{label}</label>
                      <input
                        value={aeOverrides[key]?.[field] || ""}
                        onChange={e => setAeOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: e.target.value }}))}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
                        placeholder={label} />
                    </div>
                  ))}
                </div>'''

new = '''                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[["AE Name","name","aeContact"],["Email","email","aeEmail"],["Phone","phone","aePhone"]].map(([label, field, branchField]) => {
                    const branchDefault = lender[branchField] || "";
                    const loValue = aeOverrides[key]?.[field];
                    const hasOverride = loValue !== undefined && loValue !== "" && loValue !== branchDefault;
                    const displayValue = loValue !== undefined ? loValue : branchDefault;
                    return (
                      <div key={field}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-slate-500">{label}</label>
                          {hasOverride
                            ? <span className="text-xs text-purple-400 font-semibold">My override</span>
                            : branchDefault
                            ? <span className="text-xs text-slate-600">Branch default</span>
                            : null}
                        </div>
                        <input
                          value={displayValue}
                          onChange={e => setAeOverrides(prev => ({ ...prev, [key]: { ...prev[key], [field]: e.target.value }}))}
                          className={"w-full px-3 py-1.5 border rounded-lg text-white text-sm " +
                            (hasOverride ? "bg-purple-900/30 border-purple-600" : "bg-slate-800 border-slate-600")}
                          placeholder={label} />
                        {hasOverride && (
                          <button
                            onClick={() => setAeOverrides(prev => { const u = {...prev}; if(u[key]) { delete u[key][field]; } return u; })}
                            className="text-xs text-slate-500 hover:text-slate-300 mt-0.5">
                            ↩ Revert to branch default
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>'''

c = c.replace(old, new)

with open("src/pages/Admin.jsx", "w", encoding="utf-8") as f:
    f.write(c)
print("Admin.jsx updated - AE contacts auto-populate with branch defaults, LO override supported")
