
// Google Apps Script (Code.gs)
// Add this to your existing script project and deploy as Web App (Execute as: Me, Who has access: Anyone)

const SECRET = "123321"; // Or use your configured secret
const SPREADSHEET_ID = "1BMeD4gUt0AxjomdjtmHJFbwQAfwZC0yppSkf_dTxEVQ";

// UPDATE THESE NAMES IF NEEDED
const SHEET_ACCOUNTS = "ACCOUNTS";
const SHEET_TEACHERS = "TEACHERS"; // Check your sheet name for teachers
const SHEET_STUDENTS = "DIEM_2526"; // Check your main student/score sheet name

function doPost(e) {
    try {
        const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
        if (!body || body.secret !== SECRET) return json({ ok: false, error: "Unauthorized" });

        const action = String(body.action || "");
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

        // --- CASE 1: Change Password (Existing) ---
        if (action === "set_new_password" || action === "clear_new_password") {
            return handleChangePassword(ss, body, action);
        }

        // --- CASE 2: Add Teacher ---
        if (action === "add_teacher") {
            return handleAddTeacher(ss, body);
        }

        // --- CASE 3: Add Student ---
        if (action === "add_student") {
            return handleAddStudent(ss, body);
        }

        // --- CASE 4: Delete Student (Mới) ---
        if (action === "delete_student") {
            return handleDeleteStudent(ss, body);
        }

        // --- CASE 5: Update Student (Mới) ---
        if (action === "update_student") {
            return handleUpdateStudent(ss, body);
        }

        return json({ ok: false, error: "Unknown action: " + action });

    } catch (err) {
        return json({ ok: false, error: String(err && err.message ? err.message : err) });
    }
}

function handleChangePassword(ss, body, action) {
    const username = String(body.username || "").trim();
    if (!username) return json({ ok: false, error: "Missing username" });

    const sh = ss.getSheetByName(SHEET_ACCOUNTS);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${SHEET_ACCOUNTS}` });

    // ACCOUNTS headers: MHS | Họ tên HS | USERNAME | DEFAULT_PASSWORD | NEW_PASSWORD | UPDATED_AT | NOTE
    const values = sh.getDataRange().getValues();
    const header = values[0].map(h => String(h || "").trim().toUpperCase());

    // Loose match to survive minor renaming
    const findIdx = (candidates) => {
        if (!Array.isArray(candidates)) candidates = [candidates];
        for (const c of candidates) {
            const idx = header.indexOf(c);
            if (idx >= 0) return idx;
        }
        for (const c of candidates) {
            const idx = header.findIndex(h => h.includes(c));
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const idxUsername = findIdx("USERNAME");
    const idxMhs = findIdx("MHS");
    const idxNewPass = findIdx("NEW_PASSWORD");
    const idxUpdated = findIdx("UPDATED_AT");
    const idxNote = findIdx(["NOTE", "GHI CHU"]);

    if (idxNewPass < 0) return json({ ok: false, error: "Missing column NEW_PASSWORD" });

    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) {
        const u = idxUsername >= 0 ? String(values[r][idxUsername] || "").trim() : "";
        const m = idxMhs >= 0 ? String(values[r][idxMhs] || "").trim() : "";
        if ((u && u === username) || (m && m === username)) {
            rowIndex = r;
            break;
        }
    }
    if (rowIndex < 0) return json({ ok: false, error: "Account not found" });

    const now = new Date();
    const note = String(body.note || "");
    const newPass = action === "set_new_password" ? String(body.newPassword || "") : "";

    sh.getRange(rowIndex + 1, idxNewPass + 1).setValue(newPass);
    if (idxUpdated >= 0) sh.getRange(rowIndex + 1, idxUpdated + 1).setValue(now);
    if (idxNote >= 0) sh.getRange(rowIndex + 1, idxNote + 1).setValue(note);

    return json({ ok: true });
}

function handleAddTeacher(ss, body) {
    const sh = ss.getSheetByName(SHEET_TEACHERS);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${SHEET_TEACHERS}` });

    // Headers: STT	CLASS	GVCN_NAME	USERNAME	DEFAULT_PASSWORD	NEW_PASSWORD	UPDATED_AT	EMAIL

    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const className = String(body.teacherClass || "").trim();

    if (!name || !username || !password) return json({ ok: false, error: "Missing required fields" });

    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    const rowData = new Array(headers.length).fill("");
    const findIdx = (key) => headers.indexOf(key);

    const idxStt = findIdx("STT");
    const idxClass = findIdx("CLASS");
    const idxName = findIdx("GVCN_NAME");
    const idxUser = findIdx("USERNAME");
    const idxPass = findIdx("DEFAULT_PASSWORD");
    const idxUpdate = findIdx("UPDATED_AT");

    // Auto-increment STT logic
    if (idxStt >= 0) {
        const lastRow = sh.getLastRow();
        let nextStt = 1;
        if (lastRow > 1) { // Assuming row 1 is header
            const lastSttVal = sh.getRange(lastRow, idxStt + 1).getValue();
            if (!isNaN(parseFloat(lastSttVal))) nextStt = parseFloat(lastSttVal) + 1;
        }
        rowData[idxStt] = nextStt;
    }

    if (idxClass >= 0) rowData[idxClass] = className;
    if (idxName >= 0) rowData[idxName] = name;
    if (idxUser >= 0) rowData[idxUser] = username;
    if (idxPass >= 0) rowData[idxPass] = password;
    if (idxUpdate >= 0) rowData[idxUpdate] = new Date();

    sh.appendRow(rowData);
    return json({ ok: true });
}

function handleAddStudent(ss, body) {
    // Adding to DIEM_CHI_TIET
    const sh = ss.getSheetByName(SHEET_STUDENTS);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${SHEET_STUDENTS}` });

    const mhs = String(body.mhs || "").trim();
    const name = String(body.name || "").trim();
    const className = String(body.className || "").trim();

    if (!mhs || !name || !className) return json({ ok: false, error: "Missing required fields" });

    // Assuming Row 2 has headers
    const headerRowIdx = 1; // Row 2
    const headers = sh.getRange(headerRowIdx + 1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());

    const rowData = new Array(headers.length).fill("");
    const findIdx = (candidates) => {
        if (!Array.isArray(candidates)) candidates = [candidates];
        for (const c of candidates) {
            const idx = headers.findIndex(h => h === c); // Strict match
            if (idx >= 0) return idx;
        }
        for (const c of candidates) {
            const idx = headers.findIndex(h => h.includes(c)); // Loose match
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const idxMhs = findIdx(["MHS", "MA HS", "MSHS", "MÃ HS"]);
    const idxName = findIdx(["HỌ VÀ TÊN", "HO VA TEN", "NAME", "TÊN"]);
    const idxClass = findIdx(["LỚP", "LOP", "CLASS"]);

    if (idxMhs >= 0) rowData[idxMhs] = mhs;
    if (idxName >= 0) rowData[idxName] = name;
    if (idxClass >= 0) rowData[idxClass] = className;

    sh.appendRow(rowData);

    // TODO: Consider also adding to ACCOUNTS sheet so they can login?
    // If you need that, we can add a call to addAccountRow(ss, body) here.

    return json({ ok: true });
}

// --- XÓA HỌC SINH ---
function handleDeleteStudent(ss, body) {
    const sh = ss.getSheetByName(SHEET_STUDENTS);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${SHEET_STUDENTS}` });

    const mhs = String(body.mhs || "").trim();
    if (!mhs) return json({ ok: false, error: "Missing mhs" });

    // Tìm cột MHS
    const headerRowIdx = 1; // Row 2 is header (0-indexed = 1)
    const headers = sh.getRange(headerRowIdx + 1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    const idxMhs = headers.findIndex(h => h === "MHS" || h.includes("MA HS") || h.includes("MSHS"));
    if (idxMhs < 0) return json({ ok: false, error: "Cannot find MHS column" });

    // Tìm dòng chứa MHS
    const dataRange = sh.getDataRange();
    const values = dataRange.getValues();
    let rowIndex = -1;
    for (let r = headerRowIdx + 1; r < values.length; r++) {
        if (String(values[r][idxMhs] || "").trim() === mhs) {
            rowIndex = r;
            break;
        }
    }
    if (rowIndex < 0) return json({ ok: false, error: "Student not found: " + mhs });

    // Xóa dòng (row index trong sheet là 1-indexed)
    sh.deleteRow(rowIndex + 1);
    return json({ ok: true, message: "Deleted student: " + mhs });
}

// --- SỬA THÔNG TIN HỌC SINH (CHUYỂN LỚP / ĐỔI TÊN) ---
function handleUpdateStudent(ss, body) {
    const sh = ss.getSheetByName(SHEET_STUDENTS);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${SHEET_STUDENTS}` });

    const mhs = String(body.mhs || "").trim();
    const newClass = body.newClass ? String(body.newClass).trim() : null;
    const newName = body.newName ? String(body.newName).trim() : null;

    if (!mhs) return json({ ok: false, error: "Missing mhs" });
    if (!newClass && !newName) return json({ ok: false, error: "No changes provided" });

    const headerRowIdx = 1;
    const headers = sh.getRange(headerRowIdx + 1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());

    const findIdx = (candidates) => {
        if (!Array.isArray(candidates)) candidates = [candidates];
        for (const c of candidates) {
            const idx = headers.findIndex(h => h === c);
            if (idx >= 0) return idx;
        }
        for (const c of candidates) {
            const idx = headers.findIndex(h => h.includes(c));
            if (idx >= 0) return idx;
        }
        return -1;
    };

    const idxMhs = findIdx(["MHS", "MA HS", "MSHS", "MÃ HS"]);
    const idxClass = findIdx(["LỚP", "LOP", "CLASS"]);
    const idxName = findIdx(["HỌ VÀ TÊN", "HO VA TEN", "NAME", "TÊN"]);

    if (idxMhs < 0) return json({ ok: false, error: "Cannot find MHS column" });

    const dataRange = sh.getDataRange();
    const values = dataRange.getValues();
    let rowIndex = -1;
    for (let r = headerRowIdx + 1; r < values.length; r++) {
        if (String(values[r][idxMhs] || "").trim() === mhs) {
            rowIndex = r;
            break;
        }
    }
    if (rowIndex < 0) return json({ ok: false, error: "Student not found: " + mhs });

    // Cập nhật các cột
    if (newClass && idxClass >= 0) {
        sh.getRange(rowIndex + 1, idxClass + 1).setValue(newClass);
    }
    if (newName && idxName >= 0) {
        sh.getRange(rowIndex + 1, idxName + 1).setValue(newName);
    }

    return json({ ok: true, message: "Updated student: " + mhs });
}

function doGet(e) {
    const p = e.parameter || {};
    const action = p.action || "";

    if (action === "get_data") {
        return handleGetData(p.sheet);
    }

    return json({ ok: true, status: "Serving. Use ?action=get_data&sheet=NAME to fetch." });
}

function handleGetData(sheetName) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const name = sheetName || SHEET_STUDENTS;
    const sh = ss.getSheetByName(name);
    if (!sh) return json({ ok: false, error: "Sheet not found: " + name });

    const values = sh.getDataRange().getValues();
    return json({ ok: true, data: values });
}
function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
