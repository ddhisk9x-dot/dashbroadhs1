// ============================================================
// 🏫 QUẢN LÝ ĐIỂM HỌC SINH - PHIÊN BẢN HOÀN CHỈNH (V9.2 - FIX THÁNG 4)
// ============================================================
const SECRET = "123321";
const SPREADSHEET_ID = "1BMeD4gUt0AxjomdjtmHJFbwQAfwZC0yppSkf_dTxEVQ";

const CONFIG = {
    CURRENT_SHEET: "DIEM_2526",  
    ACCOUNTS_SHEET: "ACCOUNTS",
    TEACHERS_SHEET: "TEACHERS",
    YEAR_SHEETS: ["DIEM_2526", "DIEM_2627", "DIEM_2728"] 
};

function doGet(e) {
    var action = e.parameter.action;
    if (action == "get_data") {
        var sheetName = e.parameter.sheet || CONFIG.CURRENT_SHEET;
        return getData(sheetName);
    }
    if (action == "get_history") {
        var mhs = e.parameter.mhs;
        return getStudentHistory(mhs);
    }
    return json({ ok: true, status: "Serving", version: "V9.2-FixThang4" });
}

function doPost(e) {
    try {
        const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
        if (!body || body.secret !== SECRET) return json({ ok: false, error: "Unauthorized" });
        const action = String(body.action || "");
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        const targetSheet = body.sheet || CONFIG.CURRENT_SHEET;
        
        if (action === "set_new_password" || action === "clear_new_password") return handleChangePassword(ss, body, action);
        if (action === "add_teacher") return handleAddTeacher(ss, body);
        if (action === "add_student") return handleAddStudent(ss, body, targetSheet);
        if (action === "delete_student") return handleDeleteStudent(ss, body, targetSheet);
        if (action === "update_student") return handleUpdateStudent(ss, body, targetSheet);
        
        return json({ ok: false, error: "Unknown action: " + action });
    } catch (err) {
        return json({ ok: false, error: String(err && err.message ? err.message : err) });
    }
}

// ----------------------------------------------------
// FORMAT MONTH KEY - HỖ TRỢ KHOẢNG TRẮNG
// ----------------------------------------------------
function formatMonthKey(val) {
    if (val === null || val === undefined || val === "") return "";
    if (Object.prototype.toString.call(val) === "[object Date]") {
        var y = val.getFullYear();
        var m = val.getMonth() + 1;
        return y + "-" + (m < 10 ? "0" + m : m);
    }
    var s = String(val).trim();
    var match = s.match(/^(\d{4})[-/.\s]((\d{1,2}))/);
    if (match) {
        var y = match[1];
        var m = parseInt(match[2]);
        return y + "-" + (m < 10 ? "0" + m : m);
    }
    var matchVN = s.match(/^(\d{1,2})[-/.\s]((\d{4}))/);
    if (matchVN) {
        var m = parseInt(matchVN[1]);
        var y = matchVN[2];
        return y + "-" + (m < 10 ? "0" + m : m);
    }
    return "";
}

// ============================================================
// ✅ FIX V9.2: Dùng getDisplayValues() cho ROW 1 (hàng tháng)
// getValues() biến "2026-4" thành 2022 (phép trừ), gây mất tháng.
// getDisplayValues() giữ nguyên text hiển thị "2026-4".
// ============================================================
function getData(sheetName) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return json({ data: [], year: sheetName, error: "Sheet not found: " + sheetName });
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 3) return json({ data: [], year: sheetName });
    
    // ✅ FIX: Dùng getDisplayValues cho row 1 thay vì data[0]
    var lastCol = sheet.getLastColumn();
    var headers1 = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : data[0];
    
    var headers2 = data[1]; 
    var students = [];
    var colKeys = {};
    var currentMonth = "";
    
    for (var j = 0; j < headers1.length; j++) {
        var h1Raw = headers1[j];
        var h1Parsed = formatMonthKey(h1Raw);
        if (h1Parsed) currentMonth = h1Parsed;
        var h2 = String(headers2[j]).trim().toUpperCase();
        var h1Text = String(headers1[j]).trim().toUpperCase();
        
        if (h2.indexOf("MHS") >= 0 || h2.indexOf("MÃ HS") >= 0 || h2.indexOf("MA HS") >= 0 || h1Text.indexOf("MHS") >= 0) {
            colKeys[j] = "MHS"; continue;
        }
        if (h2.indexOf("TÊN") >= 0 || h2.indexOf("NAME") >= 0) {
            colKeys[j] = "HỌ VÀ TÊN"; continue;
        }
        if (h2.indexOf("LỚP") >= 0 || h2.indexOf("CLASS") >= 0) {
            colKeys[j] = "LỚP"; continue;
        }
        if (currentMonth) {
            if (h2.indexOf("TỔNG") >= 0 || h2.indexOf("TB") >= 0 || h2.indexOf("TRUNG BÌNH") >= 0 || h2.indexOf("XẾP") >= 0) continue;
            var subj = null;
            if (h2.indexOf("TOÁN") >= 0 || h2.indexOf("TOAN") >= 0) subj = "TOÁN";
            else if (h2.indexOf("NGỮ VĂN") >= 0 || h2.indexOf("NGU VAN") >= 0 || h2.indexOf("VĂN") >= 0) subj = "NGỮ VĂN";
            else if (h2.indexOf("TIẾNG ANH") >= 0 || h2.indexOf("TIENG ANH") >= 0 || h2.indexOf("ANH") >= 0) subj = "TIẾNG ANH";
            if (subj) colKeys[j] = currentMonth + " " + subj;
        }
    }
    
    for (var i = 2; i < data.length; i++) {
        var row = data[i];
        var mhs = "";
        Object.keys(colKeys).forEach(function (idx) {
            if (colKeys[idx] === "MHS") mhs = String(row[idx]).trim();
        });
        if (!mhs) continue; 
        var student = {};
        Object.keys(colKeys).forEach(function (idx) {
            var key = colKeys[idx];
            var rawVal = row[idx];
            if (key === "MHS" || key === "HỌ VÀ TÊN" || key === "LỚP") {
                student[key] = String(rawVal).trim();
            } else {
                if (typeof rawVal === 'string') rawVal = rawVal.replace(',', '.');
                var num = parseFloat(rawVal);
                if (!isNaN(num) && num >= 0 && num <= 20) student[key] = num;
            }
        });
        students.push(student);
    }
    return json({ data: students, year: sheetName });
}

function getStudentHistory(mhs) {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var history = [];
    CONFIG.YEAR_SHEETS.forEach(function (sheetName) {
        var sheet = ss.getSheetByName(sheetName);
        if (!sheet) return;
        var data = sheet.getDataRange().getValues();
        if (data.length < 3) return;
        
        // ✅ FIX: Dùng getDisplayValues cho row 1
        var lastCol = sheet.getLastColumn();
        var headers1 = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : data[0];
        
        var headers2 = data[1];
        var colKeys = {};
        var currentMonth = "";
        var mhsIndex = -1;
        for (var j = 0; j < headers1.length; j++) {
            var h1Raw = headers1[j];
            var h1Parsed = formatMonthKey(h1Raw);
            if (h1Parsed) currentMonth = h1Parsed;
            var h2 = String(headers2[j]).trim().toUpperCase();
            var h1Text = String(headers1[j]).trim().toUpperCase();
            if (h2.indexOf("MHS") >= 0 || h2.indexOf("MÃ HS") >= 0 || h2.indexOf("MA HS") >= 0 || h1Text.indexOf("MHS") >= 0) {
                colKeys[j] = "MHS"; mhsIndex = j; continue;
            }
            if (h2.indexOf("TÊN") >= 0 || h2.indexOf("NAME") >= 0) {
                colKeys[j] = "HỌ VÀ TÊN"; continue;
            }
            if (h2.indexOf("LỚP") >= 0 || h2.indexOf("CLASS") >= 0) {
                colKeys[j] = "LỚP"; continue;
            }
            if (currentMonth) {
                if (h2.indexOf("TỔNG") >= 0 || h2.indexOf("TB") >= 0 || h2.indexOf("TRUNG BÌNH") >= 0 || h2.indexOf("XẾP") >= 0) continue;
                var subj = null;
                if (h2.indexOf("TOÁN") >= 0 || h2.indexOf("TOAN") >= 0) subj = "TOÁN";
                else if (h2.indexOf("NGỮ VĂN") >= 0 || h2.indexOf("NGU VAN") >= 0 || h2.indexOf("VĂN") >= 0) subj = "NGỮ VĂN";
                else if (h2.indexOf("TIẾNG ANH") >= 0 || h2.indexOf("TIENG ANH") >= 0 || h2.indexOf("ANH") >= 0) subj = "TIẾNG ANH";
                if (subj) colKeys[j] = currentMonth + " " + subj;
            }
        }
        if (mhsIndex == -1) return;
        for (var i = 2; i < data.length; i++) {
            if (String(data[i][mhsIndex]) === String(mhs)) {
                var studentRecord = {};
                Object.keys(colKeys).forEach(function (idx) {
                    var rawVal = data[i][idx];
                    var key = colKeys[idx];
                    if (key !== "MHS" && key !== "HỌ VÀ TÊN" && key !== "LỚP" && key !== "_yearSheet") {
                        if (typeof rawVal === 'string') {
                            rawVal = rawVal.replace(',', '.').trim();
                            if (rawVal === "" || rawVal === "-") return; 
                        }
                        var num = parseFloat(rawVal);
                        if (!isNaN(num) && num >= 0 && num <= 20) studentRecord[key] = num;
                    } else {
                        studentRecord[key] = rawVal;
                    }
                });
                studentRecord["_yearSheet"] = sheetName;
                history.push(studentRecord);
                break;
            }
        }
    });
    return json({ ok: true, data: history });
}

function handleChangePassword(ss, body, action) {
    const username = String(body.username || "").trim();
    if (!username) return json({ ok: false, error: "Missing username" });
    const sh = ss.getSheetByName(CONFIG.ACCOUNTS_SHEET);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${CONFIG.ACCOUNTS_SHEET}` });
    const values = sh.getDataRange().getValues();
    const header = values[0].map(h => String(h || "").trim().toUpperCase());
    const findIdx = (candidates) => {
        if (!Array.isArray(candidates)) candidates = [candidates];
        for (const c of candidates) { const idx = header.indexOf(c); if (idx >= 0) return idx; }
        for (const c of candidates) { const idx = header.findIndex(h => h.includes(c)); if (idx >= 0) return idx; }
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
        if ((u && u === username) || (m && m === username)) { rowIndex = r; break; }
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
    const sh = ss.getSheetByName(CONFIG.TEACHERS_SHEET);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${CONFIG.TEACHERS_SHEET}` });
    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    const className = String(body.teacherClass || "").trim();
    if (!name || !username || !password) return json({ ok: false, error: "Missing required fields" });
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    const rowData = new Array(headers.length).fill("");
    const findIdx = (key) => headers.indexOf(key);
    const idxStt = findIdx("STT"); const idxClass = findIdx("CLASS"); const idxName = findIdx("GVCN_NAME");
    const idxUser = findIdx("USERNAME"); const idxPass = findIdx("DEFAULT_PASSWORD"); const idxUpdate = findIdx("UPDATED_AT");
    if (idxStt >= 0) {
        const lastRow = sh.getLastRow();
        let nextStt = 1;
        if (lastRow > 1) {
            const lastSttVal = sh.getRange(lastRow, idxStt + 1).getValue();
            if (!isNaN(parseFloat(lastSttVal))) nextStt = parseFloat(lastSttVal) + 1;
        }
        rowData[idxStt] = nextStt;
    }
    if (idxClass >= 0) rowData[idxClass] = className; if (idxName >= 0) rowData[idxName] = name;
    if (idxUser >= 0) rowData[idxUser] = username; if (idxPass >= 0) rowData[idxPass] = password;
    if (idxUpdate >= 0) rowData[idxUpdate] = new Date();
    sh.appendRow(rowData);
    return json({ ok: true });
}

function handleAddStudent(ss, body, targetSheet) {
    const sh = ss.getSheetByName(targetSheet);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${targetSheet}` });
    const mhs = String(body.mhs || "").trim(); const name = String(body.name || "").trim(); const className = String(body.className || "").trim();
    if (!mhs || !name || !className) return json({ ok: false, error: "Missing required fields" });
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    const rowData = new Array(headers.length).fill("");
    const findIdx = (cands) => { for (const c of cands) { const idx = headers.findIndex(h => h === c); if(idx>=0) return idx; }
                               for (const c of cands) { const idx = headers.findIndex(h => h.includes(c)); if(idx>=0) return idx; } return -1; };
    const idxMhs = findIdx(["MHS", "MA HS", "MSHS", "MÃ HS"]); const idxName = findIdx(["HỌ VÀ TÊN", "HO VA TEN", "NAME", "TÊN"]); const idxClass = findIdx(["LỚP", "LOP", "CLASS"]);
    if (idxMhs >= 0) rowData[idxMhs] = mhs; if (idxName >= 0) rowData[idxName] = name; if (idxClass >= 0) rowData[idxClass] = className;
    sh.appendRow(rowData); return json({ ok: true, sheet: targetSheet });
}

function handleDeleteStudent(ss, body, targetSheet) {
    const sh = ss.getSheetByName(targetSheet);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${targetSheet}` });
    const mhs = String(body.mhs || "").trim(); if (!mhs) return json({ ok: false, error: "Missing mhs" });
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    const idxMhs = headers.findIndex(h => h === "MHS" || h.includes("MA HS") || h.includes("MSHS"));
    if (idxMhs < 0) return json({ ok: false, error: "Cannot find MHS column" });
    const values = sh.getDataRange().getValues();
    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) { if (String(values[r][idxMhs] || "").trim() === mhs) { rowIndex = r; break; } }
    if (rowIndex < 0) return json({ ok: false, error: "Student not found: " + mhs });
    sh.deleteRow(rowIndex + 1); return json({ ok: true, message: "Deleted student: " + mhs, sheet: targetSheet });
}

function handleUpdateStudent(ss, body, targetSheet) {
    const sh = ss.getSheetByName(targetSheet);
    if (!sh) return json({ ok: false, error: `Missing sheet: ${targetSheet}` });
    const mhs = String(body.mhs || "").trim(); const newClass = body.newClass ? String(body.newClass).trim() : null; const newName = body.newName ? String(body.newName).trim() : null;
    if (!mhs) return json({ ok: false, error: "Missing mhs" });
    if (!newClass && !newName) return json({ ok: false, error: "No changes provided" });
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).toUpperCase().trim());
    const findIdx = (cands) => { for (const c of cands) { const idx = headers.findIndex(h => h === c); if(idx>=0) return idx; }
                               for (const c of cands) { const idx = headers.findIndex(h => h.includes(c)); if(idx>=0) return idx; } return -1; };
    const idxMhs = findIdx(["MHS", "MA HS", "MSHS", "MÃ HS"]); const idxClass = findIdx(["LỚP", "LOP", "CLASS"]); const idxName = findIdx(["HỌ VÀ TÊN", "HO VA TEN", "NAME", "TÊN"]);
    if (idxMhs < 0) return json({ ok: false, error: "Cannot find MHS column" });
    const values = sh.getDataRange().getValues();
    let rowIndex = -1;
    for (let r = 1; r < values.length; r++) { if (String(values[r][idxMhs] || "").trim() === mhs) { rowIndex = r; break; } }
    if (rowIndex < 0) return json({ ok: false, error: "Student not found: " + mhs });
    if (newClass && idxClass >= 0) sh.getRange(rowIndex + 1, idxClass + 1).setValue(newClass);
    if (newName && idxName >= 0) sh.getRange(rowIndex + 1, idxName + 1).setValue(newName);
    return json({ ok: true, message: "Updated student: " + mhs, sheet: targetSheet });
}

function json(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// ============================================================
// 🧪 DEBUG: Chạy hàm này trong editor để xem row 1 trả về gì
// Chọn hàm testDebugRow1 → bấm Run → xem Execution Log
// ============================================================
function testDebugRow1() {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(CONFIG.CURRENT_SHEET);
    var lastCol = sheet.getLastColumn();
    
    var rawRow1 = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var displayRow1 = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    
    // Chỉ hiện 15 cột cuối (nơi có tháng mới nhất)
    var startIdx = Math.max(0, lastCol - 15);
    
    Logger.log("=== SO SÁNH ROW 1: getValues vs getDisplayValues ===");
    Logger.log("Tổng cột: " + lastCol);
    Logger.log("");
    for (var i = startIdx; i < lastCol; i++) {
        var raw = rawRow1[i];
        var display = displayRow1[i];
        var parsed = formatMonthKey(raw);
        var parsedDisplay = formatMonthKey(display);
        Logger.log("Cột " + (i+1) + ": raw=" + JSON.stringify(raw) + " (type:" + typeof raw + ") → parsed='" + parsed + "' | display='" + display + "' → parsed='" + parsedDisplay + "'");
    }
    Logger.log("");
    Logger.log("=== KẾT LUẬN ===");
    Logger.log("Nếu raw là số (vd: 2022) mà display là '2026-4' → đây là lỗi, fix getDisplayValues đúng.");
    Logger.log("Nếu cả hai đều giống nhau → lỗi nằm ở chỗ khác.");
}
