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

// HELPER: to convert "h:mm:ss" duration string to total seconds
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
// Calculates the total time between shift start and end times.
// Takes two string parameters: startTime and endTime, both formatted as "hh:mm:ss am/pm".
// Handles overnight shifts by adding 24 hours if end time is less than start time.
// Converts both times to seconds, computes the difference, and converts back to format "h:mm:ss".
// Returns a string representing the shift duration (e.g., "10:12:20").
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    let endSec = timeToSeconds(endTime);

    // Handle overnight shifts (if end time is less than start time, assume next day)
    if (endSec < startSec) {
        endSec += 24 * 3600; // Add 24 hours
    }

    const diff = endSec - startSec;
    return secondsToDuration(diff);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// Calculates the idle time during a shift based on delivery hours (8:00 AM to 10:00 PM).
// Takes startTime and endTime as strings formatted "hh:mm:ss am/pm".
// Idle time includes any time before 8:00 AM and any time after 10:00 PM.
// Handles shifts that span multiple periods correctly.
// Returns a string formatted as "h:mm:ss" representing total idle time.
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    let endSec = timeToSeconds(endTime);

    // Handle overnight shifts
    if (endSec < startSec) {
        endSec += 24 * 3600;
    }

    const deliveryStart = 8 * 3600;   // 8:00 AM in seconds
    const deliveryEnd = 22 * 3600;    // 10:00 PM in seconds

    // For overnight shifts, we need to consider the next day's delivery hours
    let totalIdleSec = 0;
    let currentStart = startSec;
    let currentEnd = endSec;

    // If shift spans multiple days, break it into 24-hour chunks
    while (currentEnd - currentStart > 24 * 3600) {
        // Process one full day
        totalIdleSec += getIdleTimeForPeriod(currentStart, currentStart + 24 * 3600, deliveryStart, deliveryEnd);
        currentStart += 24 * 3600;
    }

    // Process the remaining period
    totalIdleSec += getIdleTimeForPeriod(currentStart, currentEnd, deliveryStart, deliveryEnd);

    return secondsToDuration(totalIdleSec);
}

// Helper function to calculate idle time for a specific period
function getIdleTimeForPeriod(startSec, endSec, deliveryStart, deliveryEnd) {
    let idleSec = 0;

    // Adjust delivery hours for the day based on start time's day
    let dayDeliveryStart = deliveryStart;
    let dayDeliveryEnd = deliveryEnd;

    // If this period crosses midnight, we need to handle the delivery hours correctly
    if (startSec >= 24 * 3600) {
        dayDeliveryStart += 24 * 3600;
        dayDeliveryEnd += 24 * 3600;
    }

    // Idle before delivery hours start
    if (startSec < dayDeliveryStart) {
        const idleBefore = Math.min(dayDeliveryStart, endSec) - startSec;
        if (idleBefore > 0) idleSec += idleBefore;
    }

    // Idle after delivery hours end
    if (endSec > dayDeliveryEnd) {
        const idleAfter = endSec - Math.max(dayDeliveryEnd, startSec);
        if (idleAfter > 0) idleSec += idleAfter;
    }

    return idleSec;
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// Calculates the active delivery time by subtracting idle time from total shift duration.
// Takes shiftDuration and idleTime as strings formatted "h:mm:ss".
// Returns a string formatted as "h:mm:ss" representing the active time spent on deliveries.
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = durationToSeconds(shiftDuration);
    const idleSec = durationToSeconds(idleTime);
    const activeSec = Math.max(0, shiftSec - idleSec); // Ensure non-negative
    return secondsToDuration(activeSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// Determines if a driver met their daily quota based on the date and active time.
// Takes date as "yyyy-mm-dd" and activeTime as "h:mm:ss".
// Normal daily quota is 8 hours and 24 minutes.
// During Eid al-Fitr period (April 10-30, 2025), quota is reduced to 6 hours.
// Uses manual date parsing to avoid timezone issues.
// Returns boolean true if activeTime meets or exceeds the quota, false otherwise.
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = durationToSeconds(activeTime);

    // Parse date components manually to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const shiftDate = new Date(year, month - 1, day);
    const eidStart = new Date(2025, 3, 10); // April is month 3 (0-indexed)
    const eidEnd = new Date(2025, 3, 30);

    let quotaSec;
    if (shiftDate >= eidStart && shiftDate <= eidEnd) {
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
// Adds a new shift record to the shifts text file.
// Takes textFile path and shiftObj containing driverID, driverName, date, startTime, endTime.
// First checks if an entry with same driverID and date already exists - if so, returns empty object {}.
// Calculates shiftDuration, idleTime, activeTime, and metQuota using helper functions.
// Sets hasBonus to false by default.
// Inserts the new record after the last record of the same driverID, or at the end if driverID not found.
// Returns the newly created object with all 10 properties.
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    // Validate input
    if (!shiftObj || !shiftObj.driverID || !shiftObj.driverName || !shiftObj.date || !shiftObj.startTime || !shiftObj.endTime) {
        return {};
    }

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
// Updates the bonus status for a specific driver shift record.
// Takes textFile path, driverID, date (yyyy-mm-dd), and newValue (boolean).
// Finds the record matching driverID and date in the shifts file.
// Sets its hasBonus property to the newValue.
// Writes the updated data back to the file.
// Does not return anything (void function).
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
// Counts the number of shifts in a given month where a driver earned a bonus.
// Takes textFile path, driverID, and month (can be "mm" or "m" format).
// Filters shifts for the specified driver and month, then counts those with hasBonus = true.
// Returns -1 if the driverID does not exist in the file at all.
// Otherwise returns a number representing the bonus count.
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
// Calculates the total active hours for a driver in a specific month.
// Takes textFile path, driverID, and month as a number.
// Finds all shifts for the driver in that month and sums their activeTime values.
// Includes all days, even if the driver worked on their day off.
// Returns the total as a string formatted as "hhh:mm:ss".
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
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day); // Use manual parsing to avoid timezone issues
    return days[d.getDay()];
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// Calculates the total required hours for a driver in a specific month.
// Takes textFile path, rateFile path, bonusCount number, driverID, and month number.
// Daily quota is 8h24m normally, 6h during Eid (April 10-30, 2025).
// Counts ALL calendar days in the month, not just days the driver worked.
// Excludes days that fall on the driver's scheduled day off.
// Reduces total required hours by 2 hours for each bonus the driver earned that month.
// Returns total required hours as a string formatted as "hhh:mm:ss".
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rates = readRates(rateFile);
    const driverRate = rates.find((r) => r.driverID === driverID);
    if (!driverRate) return "000:00:00";

    // Parse month and year (assuming 2025 for all dates as per assignment)
    const targetMonth = parseInt(month, 10);
    const year = 2025;

    // Get first and last day of month
    const firstDay = new Date(year, targetMonth - 1, 1);
    const lastDay = new Date(year, targetMonth, 0); // Last day of month (day 0 of next month)

    let totalRequiredSec = 0;

    // Iterate through each day of the month
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const dateStr = `${year}-${String(targetMonth).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayName = getDayName(dateStr);

        // Skip day off
        if (dayName === driverRate.dayOff) continue;

        // Check Eid period (April 10-30, 2025)
        const eidStart = new Date(2025, 3, 10);
        const eidEnd = new Date(2025, 3, 30);

        let dailyQuotaSec;
        if (d >= eidStart && d <= eidEnd) {
            dailyQuotaSec = 6 * 3600; // 6 hours during Eid
        } else {
            dailyQuotaSec = 8 * 3600 + 24 * 60; // 8h 24m normal quota
        }

        totalRequiredSec += dailyQuotaSec;
    }

    // Reduce by 2 hours per bonus
    const bonusDeductionSec = bonusCount * 2 * 3600;
    totalRequiredSec = Math.max(0, totalRequiredSec - bonusDeductionSec);

    return secondsToLongDuration(totalRequiredSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// Calculates a driver's net monthly pay after any deductions for missing hours.
// Takes driverID, actualHours string ("hhh:mm:ss"), requiredHours string ("hhh:mm:ss"), and rateFile path.
// If actual hours >= required hours, returns full basePay with no deduction.
// Otherwise calculates missing hours and applies tier-based allowance:
//   Tier 1 (Senior): 50 hours allowance
//   Tier 2 (Regular): 20 hours allowance
//   Tier 3 (Junior): 10 hours allowance
//   Tier 4 (Trainee): 3 hours allowance
// Only full hours beyond the allowance count for deduction.
// Deduction rate per hour = floor(basePay / 185)
// Returns netPay as an integer (basePay minus salaryDeduction).
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rates = readRates(rateFile);
    const driverRate = rates.find((r) => r.driverID === driverID);
    if (!driverRate) return 0; // Driver not found

    const { basePay, tier } = driverRate;

    const actualSec = durationToSeconds(actualHours);
    const requiredSec = durationToSeconds(requiredHours);

    // No deduction if driver met or exceeded required hours
    if (actualSec >= requiredSec) return basePay;

    // Missing hours in seconds
    const missingSecRaw = requiredSec - actualSec;

    // Tier-based allowance in hours (no deduction up to this many hours)
    const allowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowedSec = (allowance[tier] || 0) * 3600;

    // Subtract allowance
    const billableSec = Math.max(0, missingSecRaw - allowedSec);

    // Only full hours count for deduction
    const billableHours = Math.floor(billableSec / 3600);

    const deductionRatePerHour = Math.floor(basePay / 185);
    const salaryDeduction = billableHours * deductionRatePerHour;

    return basePay - salaryDeduction;
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