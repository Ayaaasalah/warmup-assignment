const fs = require("fs");

// HELPER: converts time string to seconds
function timeToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();
    let period = "";
    if (timeStr.includes("am")) period = "am";
    if (timeStr.includes("pm")) period = "pm";

    timeStr = timeStr.replace("am", "").replace("pm", "").trim();
    let parts = timeStr.split(":");
    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let s = parseInt(parts[2]);

    if (period === "pm" && h !== 12) h = h + 12;
    if (period === "am" && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

// HELPER: to convert "h:mm:ss" duration string to total seconds
function durationToSeconds(dur) {
    let parts = dur.trim().split(":");
    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    let s = parseInt(parts[2]);
    return h * 3600 + m * 60 + s;
}

// HELPER: to convert total seconds to "h:mm:ss"
function secondsToDuration(totalSec) {
    let h = Math.floor(totalSec / 3600);
    let m = Math.floor((totalSec % 3600) / 60);
    let s = totalSec % 60;
    let mm = m < 10 ? "0" + m : "" + m;
    let ss = s < 10 ? "0" + s : "" + s;
    return h + ":" + mm + ":" + ss;
}

// HELPER: to convert total seconds to "hhh:mm:ss" (for monthly totals)
function secondsToLongDuration(totalSec) {
    let h = Math.floor(totalSec / 3600);
    let m = Math.floor((totalSec % 3600) / 60);
    let s = totalSec % 60;
    let mm = m < 10 ? "0" + m : "" + m;
    let ss = s < 10 ? "0" + s : "" + s;
    return h + ":" + mm + ":" + ss;
}

// ============================================================
// Function 1: Calculates the time difference between shift start and end times and returns it as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSecond = timeToSeconds(startTime);
    const endSecond = timeToSeconds(endTime);
    const difference = endSecond - startSecond;
    return secondsToDuration(difference);

}

// ============================================================
// Function 2: Calculates idle hours outside delivery hours (8 AM to 10 PM) and returns as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSecond = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    const deliveryStart = 8 * 3600;   // 8:00 AM in seconds
    const deliveryEnd = 22 * 3600;    // 10:00 PM in seconds

    let idleSec = 0;

    // Idle before 8 AM
    if (startSecond < deliveryStart) {
        const idleBefore = Math.min(deliveryStart, endSec) - startSecond;
        if (idleBefore > 0) idleSec += idleBefore;
    }

    // Idle after 10 PM
    if (endSec > deliveryEnd) {
        const idleAfter = endSec - Math.max(deliveryEnd, startSec);
        if (idleAfter > 0) idleSec += idleAfter;
    }

    return secondsToDuration(idleSec);
}

// ============================================================
// Function 3: Calculates active delivery time by subtracting idle time from shift duration and returns as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = durationToSeconds(shiftDuration);
    const idleSec = durationToSeconds(idleTime);
    return secondsToDuration(shiftSec - idleSec);
}

// ============================================================
// Function 4: Checks if active hours meet daily quota (8h24m normally, 6h during Eid) and returns boolean
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = durationToSeconds(activeTime);

    // Check if date falls in Eid period (2025-04-10 to 2025-04-30)
    const d = new Date(date);
    const eidStart = new Date("2025-04-10");
    const eidEnd = new Date("2025-04-30");

    let quotaSec;
    if (d >= eidStart && d <= eidEnd) {
        quotaSec = 6 * 3600; // 6 hours
    } else {
        quotaSec = 8 * 3600 + 24 * 60; // 8h 24m
    }

    return activeSec >= quotaSec;
}

// HELPER: read and parse shifts.txt - Returns array of objects
function readShifts(textFile) {
    const content = fs.readFileSync(textFile, "utf8");
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    return lines.map((line) => {
        const parts = line.split(",");
        return {
            driverID: parts[0].trim(),
            driverName: parts[1].trim(),
            date: parts[2].trim(),
            startTime: parts[3].trim(),
            endTime: parts[4].trim(),
            shiftDuration: parts[5].trim(),
            idleTime: parts[6].trim(),
            activeTime: parts[7].trim(),
            metQuota: parts[8].trim() === "true",
            hasBonus: parts[9].trim() === "true",
        };
    });
}

// HELPER: write shifts array back to file
function writeShifts(textFile, shifts) {
    let content = "";

    for (let i = 0; i < shifts.length; i++) {
        let s = shifts[i];
        let line = s.driverID + "," + s.driverName + "," + s.date + "," + s.startTime + "," + s.endTime + "," + s.shiftDuration + "," + s.idleTime + "," + s.activeTime + "," + s.metQuota + "," + s.hasBonus;
        content = content + line + "\n";
    }

    fs.writeFileSync(textFile, content, "utf8");
}

// ============================================================
// Function 5: Adds a new shift record to shifts.txt if no duplicate exists, calculates all fields, and returns the new record or empty object
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    let driverID = shiftObj.driverID;
    let driverName = shiftObj.driverName;
    let date = shiftObj.date;
    let startTime = shiftObj.startTime;
    let endTime = shiftObj.endTime;

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

    let newEntry = {};
    newEntry.driverID = driverID;
    newEntry.driverName = driverName;
    newEntry.date = date;
    newEntry.startTime = startTime;
    newEntry.endTime = endTime;
    newEntry.shiftDuration = shiftDuration;
    newEntry.idleTime = idleTime;
    newEntry.activeTime = activeTime;
    newEntry.metQuota = quota;
    newEntry.hasBonus = false;

    // Find insertion point: after last record of this driverID,
    // or at the end if driverID not present
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
// Function 6: Updates the bonus value for a specific driver on a specific date in shifts.txt
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
    const shifts = readShifts(textFile);
    const idx = shifts.findIndex(
        (s) => s.driverID === driverID && s.date === date
    );
    if (idx !== -1) {
        shifts[idx].hasBonus = newValue;
        writeShifts(textFile, shifts);
    }
}

// ============================================================
// Function 7: Counts the number of bonus records for a driver in a given month, returns -1 if driver not found
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const shifts = readShifts(textFile);
    let count = 0;
    let found = false;

    for (let i = 0; i < shifts.length; i++) {
        if (shifts[i].driverID === driverID) {
            found = true;
            let shiftMonth = parseInt(shifts[i].date.split("-")[1]);
            if (shiftMonth === parseInt(month) && shifts[i].hasBonus === true) {
                count++;
            }
        }
    }

    if (!found) return -1;
    return count;
}

// ============================================================
// Function 8: Sums all active hours for a driver in a given month and returns as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    let shifts = readShifts(textFile);
    let targetMonth = parseInt(month);
    let totalSec = 0;

    for (let i = 0; i < shifts.length; i++) {
        let shiftMonth = parseInt(shifts[i].date.split("-")[1]);
        if (shifts[i].driverID === driverID && shiftMonth === targetMonth) {
            totalSec = totalSec + durationToSeconds(shifts[i].activeTime);
        }
    }

    return secondsToLongDuration(totalSec);
}

// HELPER: read driverRates.txt - Returns array of { driverID, dayOff, basePay, tier }
function readRates(rateFile) {
    const content = fs.readFileSync(rateFile, "utf8");
    const lines = content.split("\n").filter((l) => l.trim() !== "");
    return lines.map((line) => {
        const parts = line.split(",");
        return {
            driverID: parts[0].trim(),
            dayOff: parts[1].trim(),
            basePay: parseInt(parts[2].trim(), 10),
            tier: parseInt(parts[3].trim(), 10),
        };
    });
}

// HELPER: get day name from date string
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
    const d = new Date(dateStr);
    return days[d.getDay()];
}

// ============================================================
// Function 9: Calculates total required hours for a driver in a month (excluding day off, adjusting for bonuses and Eid) and returns as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shifts = readShifts(textFile);
    const rates = readRates(rateFile);

    let driverRate = null;
    for (let i = 0; i < rates.length; i++) {
        if (rates[i].driverID === driverID) {
            driverRate = rates[i];
            break;
        }
    }

    if (driverRate === null) return "0:00:00";

    let totalRequiredSec = 0;
    let targetMonth = parseInt(month);

    for (let i = 0; i < shifts.length; i++) {
        let shift = shifts[i];
        let shiftMonth = parseInt(shift.date.split("-")[1]);

        if (shift.driverID !== driverID) continue;
        if (shiftMonth !== targetMonth) continue;

        let dayName = getDayName(shift.date);
        if (dayName === driverRate.dayOff) continue;

        let shiftDate = new Date(shift.date);
        let eidStart = new Date("2025-04-10");
        let eidEnd = new Date("2025-04-30");

        if (shiftDate >= eidStart && shiftDate <= eidEnd) {
            totalRequiredSec += 6 * 3600;
        } else {
            totalRequiredSec += 8 * 3600 + 24 * 60;
        }
    }

    totalRequiredSec = totalRequiredSec - bonusCount * 2 * 3600;
    if (totalRequiredSec < 0) totalRequiredSec = 0;

    return secondsToLongDuration(totalRequiredSec);
}

// ============================================================
// Function 10: Calculates net monthly pay by applying tier-based deductions for missing hours
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rates = readRates(rateFile);

    let driverRate = null;
    for (let i = 0; i < rates.length; i++) {
        if (rates[i].driverID === driverID) {
            driverRate = rates[i];
            break;
        }
    }

    if (driverRate === null) return 0;

    let basePay = driverRate.basePay;
    let tier = driverRate.tier;

    let actualSec = durationToSeconds(actualHours);
    let requiredSec = durationToSeconds(requiredHours);

    if (actualSec >= requiredSec) return basePay;

    let missingSec = requiredSec - actualSec;

    let allowedHours = 0;
    if (tier === 1) allowedHours = 50;
    else if (tier === 2) allowedHours = 20;
    else if (tier === 3) allowedHours = 10;
    else if (tier === 4) allowedHours = 3;

    let allowedSec = allowedHours * 3600;

    let billableSec = missingSec - allowedSec;
    if (billableSec < 0) billableSec = 0;

    let billableHours = Math.floor(billableSec / 3600);

    let deductionPerHour = Math.floor(basePay / 185);
    let deduction = billableHours * deductionPerHour;

    return basePay - deduction;
}

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