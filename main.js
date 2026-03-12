const fs = require("fs");

// HELPER: Convert "hh:mm:ss am/pm" to seconds
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

// HELPER: Convert "h:mm:ss" to seconds
function durationToSeconds(dur) {
    dur = dur.trim();
    const parts = dur.split(":").map(Number);
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// HELPER: Convert seconds to "h:mm:ss"
function secondsToDuration(totalSec) {
    totalSec = Math.abs(Math.round(totalSec));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// HELPER: Convert seconds to "hhh:mm:ss" (for monthly totals)
function secondsToLongDuration(totalSec) {
    totalSec = Math.abs(Math.round(totalSec));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// Calculates how long a shift lasted.
// Example: "6:01:20 am" to "4:13:40 pm" = "10:12:20"
// Handles overnight shifts (if end time is earlier than start time).
// ============================================================
function getShiftDuration(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    let endSec = timeToSeconds(endTime);

    // If shift goes past midnight, add 24 hours
    if (endSec < startSec) {
        endSec += 24 * 3600;
    }

    const diff = endSec - startSec;
    return secondsToDuration(diff);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// Calculates idle time (time outside delivery hours 8am-10pm).
// Example: "6:00:00 am" to "3:00:00 pm" = "2:00:00" (idle before 8am)
// Handles shifts that span multiple days.
// ============================================================
function getIdleTime(startTime, endTime) {
    const startSec = timeToSeconds(startTime);
    let endSec = timeToSeconds(endTime);

    // Handle overnight shifts
    if (endSec < startSec) {
        endSec += 24 * 3600;
    }

    const deliveryStart = 8 * 3600;   // 8:00 AM
    const deliveryEnd = 22 * 3600;    // 10:00 PM

    // Break multi-day shifts into 24-hour chunks
    let totalIdleSec = 0;
    let currentStart = startSec;
    let currentEnd = endSec;

    while (currentEnd - currentStart > 24 * 3600) {
        totalIdleSec += getIdleTimeForPeriod(currentStart, currentStart + 24 * 3600, deliveryStart, deliveryEnd);
        currentStart += 24 * 3600;
    }

    totalIdleSec += getIdleTimeForPeriod(currentStart, currentEnd, deliveryStart, deliveryEnd);

    return secondsToDuration(totalIdleSec);
}

// Helper: Calculate idle time for one specific period
function getIdleTimeForPeriod(startSec, endSec, deliveryStart, deliveryEnd) {
    let idleSec = 0;

    // Adjust delivery hours for the current day
    let dayDeliveryStart = deliveryStart;
    let dayDeliveryEnd = deliveryEnd;

    if (startSec >= 24 * 3600) {
        dayDeliveryStart += 24 * 3600;
        dayDeliveryEnd += 24 * 3600;
    }

    // Time before delivery starts
    if (startSec < dayDeliveryStart) {
        const idleBefore = Math.min(dayDeliveryStart, endSec) - startSec;
        if (idleBefore > 0) idleSec += idleBefore;
    }

    // Time after delivery ends
    if (endSec > dayDeliveryEnd) {
        const idleAfter = endSec - Math.max(dayDeliveryEnd, startSec);
        if (idleAfter > 0) idleSec += idleAfter;
    }

    return idleSec;
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// Calculates active delivery time (shift time minus idle time).
// Example: "6:40:20" - "3:10:10" = "3:30:10"
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    const shiftSec = durationToSeconds(shiftDuration);
    const idleSec = durationToSeconds(idleTime);
    const activeSec = Math.max(0, shiftSec - idleSec);
    return secondsToDuration(activeSec);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// Checks if driver met daily quota (8h24m normally, 6h during Eid).
// Eid period: April 10-30, 2025.
// Returns true if activeTime >= quota, false otherwise.
// ============================================================
function metQuota(date, activeTime) {
    const activeSec = durationToSeconds(activeTime);

    // Parse date manually to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const shiftDate = new Date(year, month - 1, day);
    const eidStart = new Date(2025, 3, 10);
    const eidEnd = new Date(2025, 3, 30);

    let quotaSec;
    if (shiftDate >= eidStart && shiftDate <= eidEnd) {
        quotaSec = 6 * 3600; // 6 hours during Eid
    } else {
        quotaSec = 8 * 3600 + 24 * 60; // 8h 24m normal
    }

    return activeSec >= quotaSec;
}

// HELPER: Read shifts.txt file into an array of objects
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

// HELPER: Write shifts array back to shifts.txt file
function writeShifts(textFile, shifts) {
    const lines = shifts.map(
        (s) =>
            `${s.driverID},${s.driverName},${s.date},${s.startTime},${s.endTime},${s.shiftDuration},${s.idleTime},${s.activeTime},${s.metQuota},${s.hasBonus}`
    );
    fs.writeFileSync(textFile, lines.join("\n") + "\n", "utf8");
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// Adds a new shift record to the file.
// First checks for duplicate (same driverID + date). If found, returns {}.
// Calculates shiftDuration, idleTime, activeTime, metQuota.
// Sets hasBonus = false by default.
// Inserts after last record of same driverID, or at end if new driver.
// Returns the new shift object with all 10 properties.
// ============================================================
function addShiftRecord(textFile, shiftObj) {
    // Validate input
    if (!shiftObj || !shiftObj.driverID || !shiftObj.driverName || !shiftObj.date || !shiftObj.startTime || !shiftObj.endTime) {
        return {};
    }

    const { driverID, driverName, date, startTime, endTime } = shiftObj;

    const shifts = readShifts(textFile);

    // Check for duplicate
    const duplicate = shifts.find(
        (s) => s.driverID === driverID && s.date === date
    );
    if (duplicate) return {};

    // Calculate all values
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

    // Find where to insert (after last record of same driver)
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
// Updates the bonus status for a specific shift.
// Finds the record matching driverID and date, sets hasBonus = newValue.
// Writes changes back to file.
// Returns nothing.
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
// Counts how many days a driver got a bonus in a given month.
// Month can be "4" or "04" (both work).
// Returns -1 if driverID doesn't exist in file.
// Otherwise returns the count.
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
// Adds up all active hours for a driver in a given month.
// Month is a number (e.g., 4 for April).
// Returns total as "hhh:mm:ss" (e.g., "33:30:00").
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

// HELPER: Read driverRates.txt file
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

// HELPER: Get day name from date (e.g., "2025-04-15" -> "Tuesday")
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
    const d = new Date(year, month - 1, day);
    return days[d.getDay()];
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// Calculates total required hours for a driver in a month.
// Goes through EVERY day of the month:
//   - Skips driver's day off
//   - Uses 6h quota during Eid (April 10-30), 8h24m otherwise
// Then subtracts 2 hours for each bonus the driver got.
// Returns total as "hhh:mm:ss".
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const rates = readRates(rateFile);
    const driverRate = rates.find((r) => r.driverID === driverID);
    if (!driverRate) return "000:00:00";

    // Assume year is 2025
    const targetMonth = parseInt(month, 10);
    const year = 2025;

    // Get first and last day of the month
    const firstDay = new Date(year, targetMonth - 1, 1);
    const lastDay = new Date(year, targetMonth, 0);

    let totalRequiredSec = 0;

    // Loop through each day of the month
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        const dateStr = `${year}-${String(targetMonth).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayName = getDayName(dateStr);

        // Skip if this is the driver's day off
        if (dayName === driverRate.dayOff) continue;

        // Check if this day is during Eid
        const eidStart = new Date(2025, 3, 10);
        const eidEnd = new Date(2025, 3, 30);

        let dailyQuotaSec;
        if (d >= eidStart && d <= eidEnd) {
            dailyQuotaSec = 6 * 3600; // Eid quota
        } else {
            dailyQuotaSec = 8 * 3600 + 24 * 60; // Normal quota
        }

        totalRequiredSec += dailyQuotaSec;
    }

    // Subtract 2 hours for each bonus
    const bonusDeductionSec = bonusCount * 2 * 3600;
    totalRequiredSec = Math.max(0, totalRequiredSec - bonusDeductionSec);

    return secondsToLongDuration(totalRequiredSec);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// Calculates driver's monthly pay after deductions.
// If actual >= required: full pay (no deduction)
// Otherwise:
//   - Calculate missing hours
//   - Apply allowance based on tier (50/20/10/3 hours)
//   - Only full hours beyond allowance count
//   - Deduction rate = floor(basePay / 185) per hour
// Returns net pay as integer.
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const rates = readRates(rateFile);
    const driverRate = rates.find((r) => r.driverID === driverID);
    if (!driverRate) return 0;

    const { basePay, tier } = driverRate;

    const actualSec = durationToSeconds(actualHours);
    const requiredSec = durationToSeconds(requiredHours);

    // Full pay if requirements met
    if (actualSec >= requiredSec) return basePay;

    // Calculate missing hours
    const missingSecRaw = requiredSec - actualSec;

    // Tier-based allowance (hours with no deduction)
    const allowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowedSec = (allowance[tier] || 0) * 3600;

    // Hours that count for deduction (after allowance)
    const billableSec = Math.max(0, missingSecRaw - allowedSec);

    // Only full hours count
    const billableHours = Math.floor(billableSec / 3600);

    // Calculate deduction
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