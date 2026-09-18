/**
 * validator.js
 * PEA Construction & Disbursement Dashboard
 * Strict validation engine for uploaded Excel files
 */

window.ExcelValidator = (function () {
  'use strict';

  /**
   * Helper to normalize text for comparison
   */
  function cleanText(str) {
    if (!str) return '';
    return String(str).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Check if sheet headers contain specified keywords
   */
  function sheetContainsKeywords(sheet, keywords, maxRows = 10) {
    if (!sheet || !sheet['!ref']) return false;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const maxR = Math.min(range.e.r, maxRows);

    let allCellsText = '';
    for (let R = range.s.r; R <= maxR; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = sheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (cell && cell.v !== undefined) {
          allCellsText += ' ' + cleanText(cell.v);
        }
      }
    }

    return keywords.every(kw => allCellsText.includes(cleanText(kw)));
  }

  /**
   * Validate workbook structure
   * @param {Object} workbook - SheetJS Workbook object
   * @returns {Object} validation result
   */
  function validateWorkbook(workbook) {
    const result = {
      isValid: false,
      errors: [],
      warnings: [],
      matchedSheets: {
        transmission: null,
        substationDetail: null,
        substationSummary: null,
        permits: null,
        disbursements: [],
        gantt: []
      }
    };

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      result.errors.push('ไฟล์ไม่มีข้อมูลชีต (Empty Workbook)');
      return result;
    }

    const sheetNames = workbook.SheetNames;

    // 1. Identify Transmission sheet (สถานะสายส่ง)
    const transSheetName = sheetNames.find(name =>
      cleanText(name).includes('สถานะสายส่ง') || cleanText(name).includes('สายส่ง')
    );

    if (transSheetName) {
      const sheet = workbook.Sheets[transSheetName];
      const hasKeywords = sheetContainsKeywords(sheet, ['งานก่อสร้าง', 'ผลงาน']);
      if (hasKeywords) {
        result.matchedSheets.transmission = transSheetName;
      } else {
        result.errors.push(`ชีต '${transSheetName}' ขาดคอลัมน์สำคัญ เช่น 'ชื่องานก่อสร้าง' หรือ 'ผลงานสะสม'`);
      }
    } else {
      result.errors.push("ไม่พบ Sheet สำหรับ 'สถานะสายส่ง' (ตัวอย่าง: 'สถานะสายส่ง (แนบ 1)')");
    }

    // 2. Identify Permits sheet (สถานะการขออนุญาต)
    const permitSheetName = sheetNames.find(name =>
      cleanText(name).includes('สถานะการขออนุญาต') || cleanText(name).includes('ขออนุญาต')
    );

    if (permitSheetName) {
      const sheet = workbook.Sheets[permitSheetName];
      const hasKeywords = sheetContainsKeywords(sheet, ['ขออนุญาต', 'หน่วยงาน']);
      if (hasKeywords) {
        result.matchedSheets.permits = permitSheetName;
      } else {
        result.errors.push(`ชีต '${permitSheetName}' ขาดคอลัมน์สำคัญ เช่น 'รายละเอียดงานที่ขออนุญาต' หรือ 'หน่วยงาน'`);
      }
    } else {
      result.errors.push("ไม่พบ Sheet สำหรับ 'สถานะการขออนุญาต'");
    }

    // 3. Identify Substation details sheet (รายละเอียดสถานี)
    const subDetailName = sheetNames.find(name =>
      cleanText(name).includes('รายละเอียดสถานี') || cleanText(name).includes('สถานีไฟฟ้า')
    );

    if (subDetailName) {
      const sheet = workbook.Sheets[subDetailName];
      const hasKeywords = sheetContainsKeywords(sheet, ['สถานีไฟฟ้า', 'ผลงาน']);
      if (hasKeywords) {
        result.matchedSheets.substationDetail = subDetailName;
      } else {
        result.warnings.push(`ชีต '${subDetailName}' อาจมีโครงสร้างคอลัมน์แตกต่างจากมาตรฐาน`);
        result.matchedSheets.substationDetail = subDetailName;
      }
    } else {
      result.errors.push("ไม่พบ Sheet สำหรับ 'รายละเอียดสถานี' (ตัวอย่าง: 'รายละเอียดสถานี (แนบ 2-2)')");
    }

    // 4. Identify Substation Summary sheet (สรุปสถานี)
    const subSummaryName = sheetNames.find(name =>
      cleanText(name).includes('สรุปสถานี')
    );
    if (subSummaryName) {
      result.matchedSheets.substationSummary = subSummaryName;
    }

    // 5. Identify Disbursement / WBS sheets
    sheetNames.forEach(name => {
      const sheet = workbook.Sheets[name];
      if (sheet && sheetContainsKeywords(sheet, ['wbs', 'งบประมาณ'])) {
        result.matchedSheets.disbursements.push(name);
      }
    });

    if (result.matchedSheets.disbursements.length === 0) {
      result.errors.push("ไม่พบ Sheet ข้อมูลการเบิกจ่ายงบประมาณ/WBS (เช่น Sheet ที่มีรหัส WBS และคอลัมน์งบประมาณ/Act.)");
    }

    // 6. Identify Gantt / Monthly timeline sheets
    sheetNames.forEach(name => {
      if (name.includes('(ช)') || name.includes('แผนงาน')) {
        result.matchedSheets.gantt.push(name);
      }
    });

    // Final Decision: Must have zero critical errors
    result.isValid = result.errors.length === 0;

    return result;
  }

  return {
    validateWorkbook: validateWorkbook
  };
})();
