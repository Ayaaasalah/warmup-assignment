const fs = require("fs");

// ============================================================
// HELPER FUNCTIONS
// ============================================================

// Converts time string to seconds (handles AM/PM correctly)
function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== "string") return 0;

    timeStr = timeStr.trim().toLowerCase();
    let period = "";
    if (timeStr.includes("am")) period = "am";
    if (timeStr.includes("pm")) period = "pm";

    timeStr = timeStr.replace("am", "").replace("pm", "").trim();
    let parts = timeStr.split(":");
    if (parts.length !== 3) return 0;

    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let s = parseInt(parts[2]);

    if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;

    if (period === "pm" && h !== 12) h = h + 12;
    if (period === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

// Converts duration string "h:mm:ss" to seconds
function durationToSeconds(dur) {
    if (!dur || typeof dur !== "string") return 0;

    let parts = dur.trim().split(":");
    if (parts.length !== 3) return 0;

    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let s = parseInt(parts[2]);

    if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;

    return h * 3600 + m * 60 + s;
}

// Converts seconds to "h:mm:ss" format
function secondsToDuration(totalSec) {
    if (totalSec < 0) totalSec = 0;

    let h = Math.floor(totalSec / 3600);
    let m = Math.floor((totalSec % 3600) / 60);
    let s = totalSec % 60;

    let mm = m < 10 ? "0" + m : "" + m;
    let ss = s < 10 ? "0" + s : "" + s;

    return h + ":" + mm + ":" + ss;
}

// Converts seconds to "hhh:mm:ss" format (for monthly totals)
function secondsToLongDuration(totalSec) {
    if (totalSec < 0) totalSec = 0;

    let h = Math.floor(totalSec / 3600);
    let m = Math.floor((totalSec % 3600) / 60);
    let s = totalSec % 60;

    let mm = m < 10 ? "0" + m : "" + m;
    let ss = s < 10 ? "0" + s : "" + s;

    return h + ":" + mm + ":" + ss;
}

// Checks if a date falls within Eid period (using string comparison)
function isEidPeriod(date) {
    return date >= "2025-04-10" && date <= "2025-04-30";
}

// Gets day name from date string (timezone-safe)
function getDayName(dateStr) {
    const days = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
    ];

    // Parse date components to avoid timezone issues
    const [year, month, day] = dateStr.split("-").map(Number);
    // Create date in UTC to prevent timezone shifts
    const date = new Date(Date.UTC(year, month - 1, day));
    return days[date.getUTCDay()];
}

// Safely reads and parses shifts.txt
function readShifts(textFile) {
    try {
        const content = fs.readFileSync(textFile, "utf8");
        const lines = content.split("\n").filter((l) => l.trim() !== "");

        return lines.map((line) => {
            const parts = line.split(",");
            if (parts.length < 10) return null;

            return {
                driverID: parts[0]?.trim() || "",
                driverName: parts[1]?.trim() || "",
                date: parts[2]?.trim() || "",
                startTime: parts[3]?.trim() || "",
                endTime: parts[4]?.trim() || "",
                shiftDuration: parts[5]?.trim() || "",
                idleTime: parts[6]?.trim() || "",
                activeTime: parts[7]?.trim() || "",
                metQuota: parts[8]?.trim() === "true",
                hasBonus: parts[9]?.trim() === "true",
            };
        }).filter(entry => entry !== null);

    } catch (error) {
        console.error("Error reading shifts file:", error.message);
        return [];
    }
}

// Safely writes shifts array back to file
function writeShifts(textFile, shifts) {
    try {
        let content = "";
        for (let i = 0; i < shifts.length; i++) {
            let s = shifts[i];
            let line = `${s.driverID},${s.driverName},${s.date},${s.startTime},${s.endTime},${s.shiftDuration},${s.idleTime},${s.activeTime},${s.metQuota},${s.hasBonus}`;
            content += line + (i < shifts.length - 1 ? "\n" : "");
        }
        fs.writeFileSync(textFile, content, "utf8");
        return true;
    } catch (error) {
        console.error("Error writing shifts file:", error.message);
        return false;
    }
}

// Safely reads driverRates.txt
function readRates(rateFile) {
    try {
        const content = fs.readFileSync(rateFile, "utf8");
        const lines = content.split("\n").filter((l) => l.trim() !== "");

        return lines.map((line) => {
            const parts = line.split(",");
            if (parts.length < 4) return null;

            return {
                driverID: parts[0]?.trim() || "",
                dayOff: parts[1]?.trim() || "",
                basePay: parseInt(parts[2]?.trim(), 10) || 0,
                tier: parseInt(parts[3]?.trim(), 10) || 4,
            };
        }).filter(entry => entry !== null);

    } catch (error) {
        console.error("Error reading rates file:", error.message);
        return [];
    }
}

// ============================================================
// FUNCTION 1: Calculates shift duration
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSecond = timeToSeconds(startTime);
    const endSecond = timeToSeconds(endTime);
    const difference = endSecond - startSecond;
    return secondsToDuration(difference);
}

// ============================================================
// FUNCTION 2: Calculates idle time outside delivery hours (8 AM - 10 PM)
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSecond = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    const deliveryStart = 8 * 3600;   // 8:00 AM
    const deliveryEnd = 22 * 3600;    // 10:00 PM

    let idleSec = 0;

    // Idle before 8 AM
    if (startSecond < deliveryStart) {
        const idleBefore = Math.min(deliveryStart, endSec) - startSecond;
        if (idleBefore > 0) idleSec += idleBefore;
    }

    // Idle after 10 PM
    if (endSec > deliveryEnd) {
        const idleAfter = endSec - Math.max(deliveryEnd, startSecond);
        if (idleAfter > 0) idleSec += idleAfter;
    }

    return secondsToDuration(idleSec);
}

// ============================================================
// FUNCTION 3: Calculates active delivery time
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = durationToSeconds(shiftDuration);
    const idleSec = durationToSeconds(idleTime);
    return secondsToDuration(shiftSec - idleSec);
}

// ============================================================
// FUNCTION 4: Checks if met quota (8h24m normally, 6h during Eid)
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = durationToSeconds(activeTime);

    // Use string comparison for dates (timezone-safe)
    const isEid = isEidPeriod(date);
    const quotaSec = isEid ? 6 * 3600 : (8 * 3600 + 24 * 60);

    return activeSec >= quotaSec;
}

// ============================================================
// FUNCTION 5: Adds new shift record
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    // Validate input
    if (!shiftObj || !shiftObj.driverID || !shiftObj.date) {
        return {};
    }

    let driverID = shiftObj.driverID;
    let driverName = shiftObj.driverName || "";
    let date = shiftObj.date;
    let startTime = shiftObj.startTime || "";
    let endTime = shiftObj.endTime || "";

    let shifts = readShifts(textFile);

    // Check for duplicate (same driverID + date)
    for (let i = 0; i < shifts.length; i++) {
        if (shifts[i].driverID === driverID && shifts[i].date === date) {
            return {};
        }
    }

    // Calculate derived fields
    let shiftDuration = getShiftDuration(startTime, endTime);
    let idleTime = getIdleTime(startTime, endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quota = metQuota(date, activeTime);

    let newEntry = {
        driverID: driverID,
        driverName: driverName,
        date: date,
        startTime: startTime,
        endTime: endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quota,
        hasBonus: false
    };

    // Find insertion point: after last record of this driverID
    let lastIndex = -1;
    for (let i = 0; i < shifts.length; i++) {
        if (shifts[i].driverID === driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        shifts.push(newEntry);
    } else {
        shifts.splice(lastIndex + 1, 0, newEntry);
    }

    writeShifts(textFile, shifts);
    return newEntry;
}

// ============================================================
// FUNCTION 6: Updates bonus value
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    if (!driverID || !date) return;

    const shifts = readShifts(textFile);
    let found = false;

    for (let i = 0; i < shifts.length; i++) {
        if (shifts[i].driverID === driverID && shifts[i].date === date) {
            shifts[i].hasBonus = newValue === true;
            found = true;
            break;
        }
    }

    if (found) {
        writeShifts(textFile, shifts);
    }
}

// ============================================================
// FUNCTION 7: Counts bonuses per month
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    if (!driverID) return -1;

    const shifts = readShifts(textFile);
    let count = 0;
    let found = false;

    const targetMonth = parseInt(month, 10);

    for (let i = 0; i < shifts.length; i++) {
        if (shifts[i].driverID === driverID) {
            found = true;
            const shiftMonth = parseInt(shifts[i].date.split("-")[1], 10);
            if (shiftMonth === targetMonth && shifts[i].hasBonus === true) {
                count++;
            }
        }
    }

    return found ? count : -1;
}

// ============================================================
// FUNCTION 8: Calculates total active hours per month
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    if (!driverID) return "0:00:00";

    let shifts = readShifts(textFile);
    let targetMonth = parseInt(month, 10);
    let totalSec = 0;

    for (let i = 0; i < shifts.length; i++) {
        let shift = shifts[i];
        if (shift.driverID !== driverID) continue;

        let shiftMonth = parseInt(shift.date.split("-")[1], 10);
        if (shiftMonth === targetMonth) {
            totalSec += durationToSeconds(shift.activeTime);
        }
    }

    return secondsToLongDuration(totalSec);
}

// ============================================================
// FUNCTION 9: Calculates required hours per month
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    if (!driverID) return "0:00:00";

    const shifts = readShifts(textFile);
    const rates = readRates(rateFile);

    // Find driver rate
    let driverRate = null;
    for (let i = 0; i < rates.length; i++) {
        if (rates[i].driverID === driverID) {
            driverRate = rates[i];
            break;
        }
    }

    if (!driverRate) return "0:00:00";

    let totalRequiredSec = 0;
    let targetMonth = parseInt(month, 10);

    for (let i = 0; i < shifts.length; i++) {
        let shift = shifts[i];
        if (shift.driverID !== driverID) continue;

        let shiftMonth = parseInt(shift.date.split("-")[1], 10);
        if (shiftMonth !== targetMonth) continue;

        // Skip day off
        let dayName = getDayName(shift.date);
        if (dayName === driverRate.dayOff) continue;

        // Add quota based on Eid period
        if (isEidPeriod(shift.date)) {
            totalRequiredSec += 6 * 3600;
        } else {
            totalRequiredSec += 8 * 3600 + 24 * 60;
        }
    }

    // Subtract bonus hours (2 hours per bonus)
    totalRequiredSec -= (bonusCount || 0) * 2 * 3600;

    // Ensure non-negative
    if (totalRequiredSec < 0) totalRequiredSec = 0;

    return secondsToLongDuration(totalRequiredSec);
}

// ============================================================
// FUNCTION 10: Calculates net pay
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    if (!driverID) return 0;

    const rates = readRates(rateFile);

    // Find driver rate
    let driverRate = null;
    for (let i = 0; i < rates.length; i++) {
        if (rates[i].driverID === driverID) {
            driverRate = rates[i];
            break;
        }
    }

    if (!driverRate) return 0;

    let basePay = driverRate.basePay;
    let tier = driverRate.tier;

    let actualSec = durationToSeconds(actualHours);
    let requiredSec = durationToSeconds(requiredHours);

    // If actual hours meet or exceed required, full pay
    if (actualSec >= requiredSec) return basePay;

    // Calculate missing hours
    let missingSec = requiredSec - actualSec;

    // Allowed missing hours based on tier
    let allowedHours = 0;
    if (tier === 1) allowedHours = 50;
    else if (tier === 2) allowedHours = 20;
    else if (tier === 3) allowedHours = 10;
    else if (tier === 4) allowedHours = 3;

    let allowedSec = allowedHours * 3600;

    // Billable seconds after allowance
    let billableSec = missingSec - allowedSec;
    if (billableSec < 0) billableSec = 0;

    // Only full hours count
    let billableHours = Math.floor(billableSec / 3600);

    // Deduction rate (floor division)
    let deductionPerHour = Math.floor(basePay / 185);
    let deduction = billableHours * deductionPerHour;

    return basePay - deduction;
}

// ============================================================
// EXPORTS
// ============================================================
module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};