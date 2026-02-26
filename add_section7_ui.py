"""
add_section7_ui.py
Adds Section 7 upload UI and UploadField component to LenderIntakeForm.jsx
Run from: C:\\Users\\Sherae's Computer\\loanbeacons-app
"""

import sys

path = "src/modules/LenderIntakeForm.jsx"

with open(path, "r", encoding="utf-8") as f:
    c = f.read()

original = c

# ── CHANGE 1: Add Section 7 UI before submission review step ─────────────────

# Find the submission review step comment
target = "        {/* STEP: SUBMISSION REVIEW */}"
if target not in c:
    print("ERROR: Could not find submission review step comment.")
    sys.exit(1)

section7_ui = """        {/* STEP: DOCUMENT UPLOADS */}
        {steps[currentStep] === "doc_uploads" && (
          <FormSection title="Section 7 — Document Uploads" subtitle="Upload your current guidelines, rate sheets, and templates. All documents are stored securely and tied to your lender profile.">

            <SectionSubhead>All Lender Types</SectionSubhead>
            <UploadField label="Rate Sheet / Pricing Matrix" fieldKey="rateSheet" note="Current points and pricing tiers — PDF or Excel" uploads={uploads} onUpload={handleUploadFile} />
            <UploadField label="Full Guidelines Document" fieldKey="guidelines" note="Your complete underwriting guidelines — PDF" uploads={uploads} onUpload={handleUploadFile} />
            <UploadField label="Product Flyer / One-Pager" fieldKey="productFlyer" note="LO-facing summary of your products — PDF" uploads={uploads} onUpload={handleUploadFile} />
            <UploadField label="Broker Agreement Template" fieldKey="brokerAgreement" note="Standard broker agreement for new approvals — PDF" uploads={uploads} onUpload={handleUploadFile} />

            {formData.lenderType === "hard_money" && (
              <>
                <SectionSubhead>Hard Money / Bridge Specific</SectionSubhead>
                <UploadField label="Draw Schedule Template" fieldKey="drawScheduleTemplate" note="How draws are structured and requested — PDF or Excel" uploads={uploads} onUpload={handleUploadFile} />
                <UploadField label="Rehab Budget Template" fieldKey="rehabBudgetTemplate" note="The form or spreadsheet you require for rehab bids" uploads={uploads} onUpload={handleUploadFile} />
                <UploadField label="Sample Term Sheet" fieldKey="sampleTermSheet" note="Example term sheet so LOs know what to expect — PDF" uploads={uploads} onUpload={handleUploadFile} />
              </>
            )}

            {formData.lenderType === "conventional" && (
              <>
                <SectionSubhead>Conventional / Agency Specific</SectionSubhead>
                <UploadField label="LLPA / Pricing Adjustment Matrix" fieldKey="llpaMatrix" note="Loan level price adjustment grid — PDF or Excel" uploads={uploads} onUpload={handleUploadFile} />
                <UploadField label="Overlay Matrix" fieldKey="overlayMatrix" note="Summary of your overlays vs. agency guidelines" uploads={uploads} onUpload={handleUploadFile} />
              </>
            )}

            {formData.lenderType === "nonqm" && (
              <>
                <SectionSubhead>Non-QM Specific</SectionSubhead>
                <UploadField label="Product Matrix" fieldKey="productMatrix" note="All Non-QM products with LTV, FICO, and doc type by product" uploads={uploads} onUpload={handleUploadFile} />
                <UploadField label="Bank Statement Guidelines" fieldKey="bankStatementGuidelines" note="Specific bank statement underwriting guidelines — PDF" uploads={uploads} onUpload={handleUploadFile} />
                <UploadField label="DSCR Guidelines" fieldKey="dscrGuidelines" note="DSCR product-specific guidelines — PDF" uploads={uploads} onUpload={handleUploadFile} />
              </>
            )}

            <div style={{ marginTop: "20px", padding: "12px 16px", background: "#1a1f2e", borderRadius: "8px", border: "1px solid #1e2535", color: "#475569", fontSize: "11px", lineHeight: "1.6" }}>
              All documents are stored securely in LoanBeacons private storage. Only accessible to verified LOs and platform administrators. Documents are never shared publicly. You can update any document at any time by resubmitting this form.
            </div>
          </FormSection>
        )}

"""

c = c.replace(target, section7_ui + target, 1)
print("✓ Change 1: Added Section 7 document uploads UI")


# ── CHANGE 2: Add UploadField component before styles section ─────────────────

styles_marker = "// ── STYLES"
if styles_marker not in c:
    print("ERROR: Could not find STYLES section.")
    sys.exit(1)

upload_field_component = """// ── UPLOAD FIELD COMPONENT ───────────────────────────────────────────────────

const UploadField = ({ label, fieldKey, note, uploads, onUpload }) => {
  const upload = uploads[fieldKey];
  const isDone = upload?.url;
  const isUploading = upload?.file && (upload.progress < 100) && !upload.error;
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


"""

c = c.replace(styles_marker, upload_field_component + styles_marker, 1)
print("✓ Change 2: Added UploadField component")


# ── WRITE ─────────────────────────────────────────────────────────────────────
if c == original:
    print("\nWARNING: No changes made.")
    sys.exit(1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)

print("\n✅ Section 7 UI complete. LenderIntakeForm.jsx fully updated.")
print("   Make sure Firebase Storage rules are set in the Firebase Console.")
