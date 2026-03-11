

const fs = require("fs");

// HELPER: to convert "hh:mm:ss am/pm" to total seconds

function timeToSeconds(timeStr) {
    timeStr = timeStr.trim().toLowerCase();
    const isPM = timeStr.endsWith("pm");
    const isAM = timeStr.endsWith("am");
    const timePart = timeStr.replace("am", "").replace("pm", "").trim();
    let [h, m, s] = timePart.split(":").map(Number);

    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;

    return h * 3600 + m * 60 + s;
}

// HELPER :to convert "h:mm:ss" duration string to total seconds

function durationToSeconds(dur) {
    dur = dur.trim();
    const parts = dur.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// HELPER: to convert total seconds to "h:mm:ss"

function secondsToDuration(totalSec) {
    totalSec = Math.abs(Math.round(totalSec));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// HELPER: to convert total seconds to "hhh:mm:ss" (for monthly totals)

function secondsToLongDuration(totalSec) {
    totalSec = Math.abs(Math.round(totalSec));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}


// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);
    const diff = endSec - startSec;
    return secondsToDuration(diff);

}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    const endSec = timeToSeconds(endTime);

    const deliveryStart = 8 * 3600;   // 8:00 AM in seconds
    const deliveryEnd = 22 * 3600;    // 10:00 PM in seconds

    let idleSec = 0;

    // Idle before 8 AM
    if (startSec < deliveryStart) {
        const idleBefore = Math.min(deliveryStart, endSec) - startSec;
        if (idleBefore > 0) idleSec += idleBefore;
    }

    // Idle after 10 PM
    if (endSec > deliveryEnd) {
        const idleAfter = endSec - Math.max(deliveryEnd, startSec);
        if (idleAfter > 0) idleSec += idleAfter;
    }

    return secondsToDuration(idleSec);}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = durationToSeconds(shiftDuration);
    const idleSec = durationToSeconds(idleTime);
    return secondsToDuration(shiftSec - idleSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
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
// HELPER: read and parse shifts.txt
// Returns array of objects

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



function writeShifts(textFile, shifts) {
    const lines = shifts.map(
        (s) =>
            `${s.driverID},${s.driverName},${s.date},${s.startTime},${s.endTime},${s.shiftDuration},${s.idleTime},${s.activeTime},${s.metQuota},${s.hasBonus}`
    );
    fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
}



// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    const { driverID, driverName, date, startTime, endTime } = shiftObj;

    const shifts = readShifts(textFile);

    // Check for duplicate (same driverID + date)
    const duplicate = shifts.find(
        (s) => s.driverID === driverID && s.date === date
    );
    if (duplicate) return {};

    // Calculate derived fields
    const shiftDuration = getShiftDuration(startTime, endTime);
    const idleTime = getIdleTime(startTime, endTime);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const quota = metQuota(date, activeTime);

    const newEntry = {
        driverID,
        driverName,
        date,
        startTime,
        endTime,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: quota,
        hasBonus: false,
    };

    // Find insertion point: after last record of this driverID,
    // or at the end if driverID not present
    const lastIndex = shifts.reduce((acc, s, i) => {
        if (s.driverID === driverID) return i;
        return acc;
    }, -1);

    if (lastIndex === -1) {
        shifts.push(newEntry);
    } else {
        shifts.splice(lastIndex + 1, 0, newEntry);
    }

    writeShifts(textFile, shifts);

    return newEntry;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
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
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    const shifts = readShifts(textFile);

    const driverShifts = shifts.filter((s) => s.driverID === driverID);
    if (driverShifts.length === 0) return -1;

    const targetMonth = parseInt(month, 10);

    return driverShifts.filter((s) => {
        const shiftMonth = parseInt(s.date.split("-")[1], 10);
        return shiftMonth === targetMonth && s.hasBonus === true;
    }).length;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const shifts = readShifts(textFile);
    const targetMonth = parseInt(month, 10);

    const relevant = shifts.filter((s) => {
        const shiftMonth = parseInt(s.date.split("-")[1], 10);
        return s.driverID === driverID && shiftMonth === targetMonth;
    });

    const totalSec = relevant.reduce(
        (acc, s) => acc + durationToSeconds(s.activeTime),
        0
    );

    return secondsToLongDuration(totalSec);
}

// HELPER: read driverRates.txt
// Returns array of { driverID, dayOff, basePay, tier }

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
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const shifts = readShifts(textFile);
    const rates = readRates(rateFile);

    const driverRate = rates.find((r) => r.driverID === driverID);
    if (!driverRate) return "000:00:00";

    const targetMonth = parseInt(month, 10);

    const relevant = shifts.filter((s) => {
        const shiftMonth = parseInt(s.date.split("-")[1], 10);
        return s.driverID === driverID && shiftMonth === targetMonth;
    });

    let totalRequiredSec = 0;

    for (const shift of relevant) {
        const dayName = getDayName(shift.date);

        // Skip day off
        if (dayName === driverRate.dayOff) continue;

        // Check Eid period
        const d = new Date(shift.date);
        const eidStart = new Date("2025-04-10");
        const eidEnd = new Date("2025-04-30");

        let dailyQuotaSec;
        if (d >= eidStart && d <= eidEnd) {
            dailyQuotaSec = 6 * 3600;
        } else {
            dailyQuotaSec = 8 * 3600 + 24 * 60; // 8h 24m
        }

        totalRequiredSec += dailyQuotaSec;
    }

    // Reduce by 2 hours per bonus
    const bonusDeductionSec = bonusCount * 2 * 3600;
    totalRequiredSec = Math.max(0, totalRequiredSec - bonusDeductionSec);

    return secondsToLongDuration(totalRequiredSec);}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rates = readRates(rateFile);
    const driverRate = rates.find((r) => r.driverID === driverID);
    if (!driverRate) return 0;

    const { basePay, tier } = driverRate;

    const actualSec = durationToSeconds(actualHours);
    const requiredSec = durationToSeconds(requiredHours);

    // No deduction if driver met or exceeded required hours
    if (actualSec >= requiredSec) return basePay;

    // Missing hours in seconds
    let missingSecRaw = requiredSec - actualSec;

    // Tier-based allowance in hours (no deduction up to this many hours)
    const allowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowedSec = (allowance[tier] || 0) * 3600;

    // Subtract allowance
    const billableSec = Math.max(0, missingSecRaw - allowedSec);

    // Only full hours count
    const billableHours = Math.floor(billableSec / 3600);

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableHours * deductionRatePerHour;

    return basePay - salaryDeduction;}

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