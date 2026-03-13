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

// HELPER: Convert seconds to time format (handles both regular and long formats)
function secondsToDuration(totalSec, longFormat = false) {
    totalSec = Math.abs(Math.round(totalSec));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const hourFormat = longFormat ? String(h) : h.toString();
    return `${hourFormat}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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

    let idleSec = 0;
    let currentStart = startSec;
    let remainingEnd = endSec;

    // Handle multi-day shifts by processing each 24-hour period
    while (remainingEnd - currentStart > 24 * 3600) {
        // Process a full day
        const dayEnd = currentStart + 24 * 3600;

        // Idle before delivery starts on this day
        if (currentStart < deliveryStart + Math.floor(currentStart / (24 * 3600)) * 24 * 3600) {
            const dayDeliveryStart = deliveryStart + Math.floor(currentStart / (24 * 3600)) * 24 * 3600;
            idleSec += Math.min(dayDeliveryStart, dayEnd) - currentStart;
        }

        // Idle after delivery ends on this day
        const dayDeliveryEnd = deliveryEnd + Math.floor(currentStart / (24 * 3600)) * 24 * 3600;
        if (dayEnd > dayDeliveryEnd) {
            idleSec += dayEnd - Math.max(dayDeliveryEnd, currentStart);
        }

        currentStart = dayEnd;
    }

    // Process the final partial day
    const dayOffset = Math.floor(currentStart / (24 * 3600)) * 24 * 3600;
    const dayDeliveryStart = deliveryStart + dayOffset;
    const dayDeliveryEnd = deliveryEnd + dayOffset;

    // Idle before delivery starts
    if (currentStart < dayDeliveryStart) {
        idleSec += Math.min(dayDeliveryStart, remainingEnd) - currentStart;
    }

    // Idle after delivery ends
    if (remainingEnd > dayDeliveryEnd) {
        idleSec += remainingEnd - Math.max(dayDeliveryEnd, currentStart);
    }

    return secondsToDuration(idleSec);
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

    // Check if date is within Eid period (April 10-30, 2025)
    const isEid = (year === 2025 && month === 4 && day >= 10 && day <= 30);

    const quotaSec = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;
    return activeSec >= quotaSec;
}

// HELPER: Read shifts.txt file into an array of objects with error handling
function readShifts(textFile) {
    try {
        const content = fs.readFileSync(textFile, "utf8");
        if (!content || !content.trim()) return [];

        const lines = content.split("\n").filter((l) => l.trim() !== "");
        return lines.map((line) => {
            const parts = line.split(",");
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
        });
    } catch (error) {
        // Return empty array if file doesn't exist or can't be read
        return [];
    }
}

// HELPER: Write shifts array back to shifts.txt file
function writeShifts(textFile, shifts) {
    try {
        const lines = shifts.map(
            (s) =>
                `${s.driverID},${s.driverName},${s.date},${s.startTime},${s.endTime},${s.shiftDuration},${s.idleTime},${s.activeTime},${s.metQuota},${s.hasBonus}`
        );
        fs.writeFileSync(textFile, lines.join("\n") + (lines.length > 0 ? "\n" : ""), "utf8");
    } catch (error) {
        // Silently fail for this assignment
    }
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
    // Validate input - check for required properties only
    if (!shiftObj || !shiftObj.driverID || !shiftObj.driverName ||
        !shiftObj.date || !shiftObj.startTime || !shiftObj.endTime) {
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
        const [shiftYear, shiftMonth] = s.date.split("-").map(Number);
        return s.driverID === driverID && shiftMonth === targetMonth;
    });

    const totalSec = relevant.reduce(
        (acc, s) => acc + durationToSeconds(s.activeTime),
        0
    );

    return secondsToDuration(totalSec, true);
}

// HELPER: Read driverRates.txt file with error handling
function readRates(rateFile) {
    try {
        const content = fs.readFileSync(rateFile, "utf8");
        if (!content || !content.trim()) return [];

        const lines = content.split("\n").filter((l) => l.trim() !== "");
        return lines.map((line) => {
            const parts = line.split(",");
            return {
                driverID: parts[0]?.trim() || "",
                dayOff: parts[1]?.trim() || "",
                basePay: parseInt(parts[2]?.trim(), 10) || 0,
                tier: parseInt(parts[3]?.trim(), 10) || 4,
            };
        });
    } catch (error) {
        return [];
    }
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
    // Use UTC to avoid timezone issues
    const date = new Date(Date.UTC(year, month - 1, day));
    return days[date.getUTCDay()];
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
    if (!driverRate) return "0:00:00";

    const shifts = readShifts(textFile);
    const targetMonth = parseInt(month, 10);

    // Get the year from actual shift data for this driver
    const driverShifts = shifts.filter(s => s.driverID === driverID);
    if (driverShifts.length === 0) return "0:00:00";

    // Use the year from the first shift (assuming all shifts for this driver in this month are from same year)
    const year = parseInt(driverShifts[0].date.split('-')[0], 10);

    // Get number of days in the month
    const daysInMonth = new Date(year, targetMonth, 0).getDate();

    let totalRequiredSec = 0;

    // Loop through each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayName = getDayName(dateStr);

        // Skip if this is the driver's day off
        if (dayName === driverRate.dayOff) continue;

        // Check if this day is during Eid (April 10-30, 2025)
        const isEid = (year === 2025 && targetMonth === 4 && day >= 10 && day <= 30);

        const dailyQuotaSec = isEid ? 6 * 3600 : 8 * 3600 + 24 * 60;
        totalRequiredSec += dailyQuotaSec;
    }

    // Subtract 2 hours for each bonus
    const bonusDeductionSec = bonusCount * 2 * 3600;
    totalRequiredSec = Math.max(0, totalRequiredSec - bonusDeductionSec);

    return secondsToDuration(totalRequiredSec, true);
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
    const missingSec = requiredSec - actualSec;

    // Tier-based allowance (hours with no deduction)
    const allowance = { 1: 50, 2: 20, 3: 10, 4: 3 };
    const allowedSec = (allowance[tier] || 0) * 3600;

    // Hours that count for deduction (after allowance)
    const billableSec = Math.max(0, missingSec - allowedSec);

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