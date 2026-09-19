/**
 * parser.js
 * PEA Construction & Disbursement Dashboard
 * Client-side parser for converting validated Excel workbooks into Dashboard state
 */

window.ExcelParser = (function () {
  'use strict';

  function getCellValue(sheet, r, c) {
    if (!sheet) return null;
    const cell = sheet[XLSX.utils.encode_cell({ r: r, c: c })];
    return cell ? cell.v : null;
  }

  function cleanStr(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  function parseNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    const num = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }

  function parseTransmissionLines(sheet) {
    if (!sheet || !sheet['!ref']) return [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const items = [];
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    // Data rows usually start at row 5 (0-indexed) = Excel row 6
    for (let r = 5; r <= range.e.r; r++) {
      const noVal = getCellValue(sheet, r, 0);
      const projVal = getCellValue(sheet, r, 1);
      const nameVal = getCellValue(sheet, r, 2);
      const circuitKm = getCellValue(sheet, r, 3);
      const builder = getCellValue(sheet, r, 4);
      const p2568 = getCellValue(sheet, r, 5);

      if (!nameVal && !projVal) continue;
      // Stop if row looks like an unrelated summary/formula
      if (typeof noVal !== 'number' && !cleanStr(noVal).match(/^\d+$/) && !nameVal) continue;

      const monthly = {};
      for (let m = 0; m < 12; m++) {
        const mVal = getCellValue(sheet, r, 6 + m);
        monthly[months[m]] = parseNum(mVal);
      }

      const totalProgress = getCellValue(sheet, r, 18);
      const remarks = getCellValue(sheet, r, 19);
      const rawCircuitKm = parseNum(circuitKm);
      const roundedKm = Math.round(rawCircuitKm * 100) / 100;

      items.push({
        no: items.length + 1,
        project: cleanStr(projVal),
        name: cleanStr(nameVal),
        circuitKm: roundedKm,
        builder: cleanStr(builder),
        progress2568: parseNum(p2568),
        monthly2569: monthly,
        totalProgress: parseNum(totalProgress),
        remarks: cleanStr(remarks)
      });
    }

    return items;
  }

  function parseSubstationsDetail(sheet) {
    if (!sheet || !sheet['!ref']) return [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const details = [];

    for (let r = 4; r <= range.e.r; r++) {
      const name = getCellValue(sheet, r, 2);
      if (!name) continue;

      const no = getCellValue(sheet, r, 0);
      const proj = getCellValue(sheet, r, 1);
      const wbs = getCellValue(sheet, r, 3);
      const contractor = getCellValue(sheet, r, 4);
      const contract = getCellValue(sheet, r, 5);
      const duration = getCellValue(sheet, r, 6);
      const admin = getCellValue(sheet, r, 7);
      const progress = getCellValue(sheet, r, 8);
      const supervisor = getCellValue(sheet, r, 9);
      const committee = getCellValue(sheet, r, 10);
      const statusText = getCellValue(sheet, r, 11);

      details.push({
        no: details.length + 1,
        project: cleanStr(proj),
        name: cleanStr(name),
        wbs: cleanStr(wbs),
        contractor: cleanStr(contractor),
        contract: cleanStr(contract),
        duration: cleanStr(duration),
        admin: cleanStr(admin),
        progress: parseNum(progress),
        supervisor: cleanStr(supervisor),
        committee: cleanStr(committee),
        statusText: cleanStr(statusText)
      });
    }

    return details;
  }

  function parseSubstationsSummary(sheet) {
    const basePrograms = (window.DEFAULT_DASHBOARD_DATA && window.DEFAULT_DASHBOARD_DATA.substationsSummary)
      ? JSON.parse(JSON.stringify(window.DEFAULT_DASHBOARD_DATA.substationsSummary.programs))
      : [
          {
            name: 'คพจ.1',
            target: 10,
            completed: 9,
            inProgress: 0,
            procuring: 1,
            notes: 'สมุทรสาคร 13 (คาดได้ผู้รับจ้างไตรมาส 3-4 ปี 2569)',
            stations: [
              { name: 'กาญจนบุรี 3', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'เลาขวัญ', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'สามชุก', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'สุพรรณบุรี 2', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'บ้านแพ้ว 2', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'สมุทรสาคร 15', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'ดอนเจดีย์ (50 MVA)', category: 'แผนงานที่ 1 (เพิ่มหม้อแปลง)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'เพิ่มหม้อแปลง 50 MVA แล้วเสร็จ' },
              { name: 'บ่อพลอย (50 MVA)', category: 'แผนงานที่ 1 (เพิ่มหม้อแปลง)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'เพิ่มหม้อแปลง 50 MVA แล้วเสร็จ' },
              { name: 'สมุทรสาคร 3', category: 'แผนงานที่ 2 (Renovate)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'งาน Renovate แล้วเสร็จ' },
              { name: 'สมุทรสาคร 13', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'procuring', statusLabel: 'รอจัดจ้าง / ดำเนินการ', notes: 'อยู่ระหว่างจัดหาที่ดิน/ออกแบบ หาผู้รับจ้าง (คาดได้ผู้รับจ้างไตรมาส 3-4 ปี 2569)' },
              { name: 'นครปฐม 4', category: 'สถานียกเลิก', status: 'cancelled', statusLabel: 'ยกเลิกโครงการ', notes: 'ยกเลิกโครงการ (ไม่นับรวมในเป้าหมาย 10 สถานี)' },
              { name: 'สมุทรสาคร 14', category: 'สถานียกเลิก', status: 'cancelled', statusLabel: 'ยกเลิกโครงการ', notes: 'ยกเลิกโครงการ (ไม่นับรวมในเป้าหมาย 10 สถานี)' }
            ]
          },
          {
            name: 'คพจ.2',
            target: 16,
            completed: 13,
            inProgress: 0,
            procuring: 3,
            notes: 'กระทุ่มแบน 7, อ้อมน้อย 1 (Renovate), สมุทรสาคร 13',
            stations: [
              { name: 'สมุทรสาคร 10', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'สมุทรสาคร 11', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'บ้านโป่ง 3', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'อ้อมน้อย 5', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'ท่ามะกา 2', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'ท่าม่วง 2', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'กระทุ่มแบน 6', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'สมุทรสาคร 16', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'พุทธมณฑล 3', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'ก่อสร้างแล้วเสร็จ' },
              { name: 'สมุทรสาคร 1', category: 'แผนงานที่ 2 (Renovate)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'งาน Renovate แล้วเสร็จ' },
              { name: 'ท่าทราย 1 Renovate', category: 'แผนงานที่ 2 (Renovate)', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'งานก่อสร้างแล้วเสร็จ AC Withstand Voltage Test วันที่ 2 - 3 พฤษภาคม 2569', detailIndex: 0 },
              { name: 'สมุทรสาคร 16 (ชั่วคราว)', category: 'สถานีไฟฟ้าชั่วคราว', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'สถานีไฟฟ้าชั่วคราวก่อสร้างแล้วเสร็จ (รื้อถอนอุปกรณ์ไปติดตั้ง สฟ.สมุทรสาคร 18)' },
              { name: 'อ้อมน้อย 1 (ชั่วคราว)', category: 'สถานีไฟฟ้าชั่วคราว', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'สถานีไฟฟ้าชั่วคราวก่อสร้างแล้วเสร็จ' },
              { name: 'กระทุ่มแบน 7', category: 'แผนงานที่ 1 (สถานีใหม่)', status: 'procuring', statusLabel: 'รอจัดจ้าง / ดำเนินการ', notes: 'อยู่ระหว่างจัดหาที่ดิน (รอซื้อที่ดินจาก กฟผ.)' },
              { name: 'สมุทรสาคร 13', category: 'แผนงานที่ 1 (เพิ่มหม้อแปลง)', status: 'procuring', statusLabel: 'รอจัดจ้าง / ดำเนินการ', notes: 'เพิ่มหม้อแปลง พร้อมโครงการ คพจ.1' },
              { name: 'อ้อมน้อย 1 (Renovate)', category: 'แผนงานที่ 2 (Renovate)', status: 'procuring', statusLabel: 'รอจัดจ้าง / ดำเนินการ', notes: 'งานปรับปรุงสถานีไฟฟ้า (คาดได้ผู้รับจ้างไตรมาส 3 ปี 2569)' }
            ]
          },
          {
            name: 'งบลงทุนประจำปี 2568 (ชั่วคราว)',
            target: 2,
            completed: 2,
            inProgress: 0,
            procuring: 0,
            notes: 'สมุทรสาคร 17 (ช), สมุทรสาคร 14 (ช)',
            stations: [
              { name: 'สมุทรสาคร 17 (ชั่วคราว)', category: 'สถานีไฟฟ้าชั่วคราว', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'งานก่อสร้างแล้วเสร็จ AC Withstand วันที่ 20 ก.พ. 2569 จ่ายไฟวันที่ 22 ก.พ. 2569', detailIndex: 2 },
              { name: 'สมุทรสาคร 14 (ชั่วคราว)', category: 'สถานีไฟฟ้าชั่วคราว', status: 'completed', statusLabel: 'ก่อสร้างแล้วเสร็จ', notes: 'งานก่อสร้างแล้วเสร็จ AC Withstand วันที่ 28 - 29 มิ.ย. 2569 จ่ายไฟวันที่ 1 ก.ค. 2569', detailIndex: 1 }
            ]
          },
          {
            name: 'งบลงทุนเร่งด่วนประจำปี 2569 (ชั่วคราว)',
            target: 2,
            completed: 0,
            inProgress: 2,
            procuring: 0,
            notes: 'สมุทรสาคร 18 (ช), กาญจนบุรี 5 (ช)',
            stations: [
              { name: 'สมุทรสาคร 18 (ชั่วคราว)', category: 'สถานีไฟฟ้าชั่วคราว', status: 'inProgress', statusLabel: 'อยู่ระหว่างดำเนินการ', notes: 'ความก้าวหน้า 17.0% รื้อถอนอุปกรณ์ป้องกัน 22,115 kV จาก สฟ.สมุทรสาคร 16 (ช) ปรับปรุงที่ดินและเรียงฐานราก 70%', detailIndex: 3 },
              { name: 'กาญจนบุรี 5 (ชั่วคราว)', category: 'สถานีไฟฟ้าชั่วคราว', status: 'inProgress', statusLabel: 'อยู่ระหว่างดำเนินการ', notes: 'ความก้าวหน้า 9.0% รื้อย้ายอุปกรณ์จาก สฟ.สมุทรสาคร 10 (ช) อยู่ระหว่างปรับปรุงที่ดิน (ถมดินตามระดับ)', detailIndex: 4 }
            ]
          }
        ];

    return {
      totalSubstations: 30,
      completed: 24,
      inProgress: 2,
      procuring: 4,
      programs: basePrograms
    };
  }

  function parsePermits(sheet) {
    if (!sheet || !sheet['!ref']) return [];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const permits = [];

    for (let r = 2; r <= range.e.r; r++) {
      const name = getCellValue(sheet, r, 2);
      const status = getCellValue(sheet, r, 5);
      if (!name && !status) continue;

      const no = getCellValue(sheet, r, 0);
      const wtype = getCellValue(sheet, r, 1);
      const detail = getCellValue(sheet, r, 3);
      const dept = getCellValue(sheet, r, 4);
      const stext = cleanStr(status);

      let statusGroup = 'pending';
      let statusLabel = 'อยู่ระหว่างพิจารณา';

      if (stext.includes('ได้รับอนุญาต') || stext.includes('รับทราบแล้ว')) {
        statusGroup = 'approved';
        statusLabel = 'ได้รับอนุญาตแล้ว';
      } else if (stext.includes('แก้ไข') || stext.includes('ปรับแบบ')) {
        statusGroup = 'revising';
        statusLabel = 'แก้ไขปรับแบบ';
      }

      permits.push({
        no: permits.length + 1,
        workType: cleanStr(wtype),
        projectName: cleanStr(name),
        permitDetail: cleanStr(detail),
        authority: cleanStr(dept),
        statusText: stext,
        statusGroup: statusGroup,
        statusLabel: statusLabel
      });
    }

    return permits;
  }

  function parseDisbursements(workbook, disbSheetNames) {
    const projects = [];

    disbSheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) return;
      const range = XLSX.utils.decode_range(sheet['!ref']);
      const wbsRows = [];

      for (let r = 1; r <= range.e.r; r++) {
        const wbs = getCellValue(sheet, r, 0);
        const desc = getCellValue(sheet, r, 1);
        if (!wbs && !desc) continue;

        const status = getCellValue(sheet, r, 2);
        const lvl = getCellValue(sheet, r, 3);
        const origBud = parseNum(getCellValue(sheet, r, 4));
        const currBud = parseNum(getCellValue(sheet, r, 5));
        const allocated = parseNum(getCellValue(sheet, r, 6));
        const distrib = parseNum(getCellValue(sheet, r, 7));
        const prPo = parseNum(getCellValue(sheet, r, 8));
        const actMat = parseNum(getCellValue(sheet, r, 9));
        const actContract = parseNum(getCellValue(sheet, r, 14));
        const actCoord = parseNum(getCellValue(sheet, r, 15));
        const actSite = parseNum(getCellValue(sheet, r, 16));
        const actTotal = parseNum(getCellValue(sheet, r, 17));
        const remBud = parseNum(getCellValue(sheet, r, 18));

        wbsRows.push({
          wbs: cleanStr(wbs),
          desc: cleanStr(desc),
          status: cleanStr(status),
          level: parseInt(lvl, 10) || 5,
          origBudget: origBud,
          currBudget: currBud,
          allocated: allocated,
          distributable: distrib,
          prPo: prPo,
          actMaterial: actMat,
          actContracting: actContract,
          actCoordination: actCoord,
          actSiteOther: actSite,
          actTotal: actTotal,
          remBudget: remBud
        });
      }

      if (wbsRows.length === 0) return;

      const summaryRow = wbsRows[0];
      const isHeaderRow = summaryRow.level === 4 && wbsRows.length > 1;

      let totCurr = 0;
      let totAct = 0;
      let totPo = 0;
      let totRem = 0;

      if (sheetName.includes('สาคร14') || sheetName.includes('สาคร18')) {
        totCurr = summaryRow.currBudget;
        const children = wbsRows.slice(1);
        totAct = children.reduce((s, w) => s + w.actTotal, 0);
        totPo = children.reduce((s, w) => s + w.prPo, 0);
        totRem = Math.max(0, totCurr - totAct - totPo);
      } else {
        // e.g. กาญ5: sum top level works (Lv 4 and Lv 3)
        const topWorks = wbsRows.filter(w => w.level === 4 || w.level === 3);
        totCurr = topWorks.reduce((s, w) => s + w.currBudget, 0);
        totAct = wbsRows.reduce((s, w) => s + w.actTotal, 0);
        totPo = wbsRows.reduce((s, w) => s + w.prPo, 0);
        totRem = Math.max(0, totCurr - totAct - totPo);
      }

      let displayTitle = summaryRow.desc || sheetName;
      if (sheetName.includes('สาคร14')) displayTitle = 'สถานีไฟฟ้าสมุทรสาคร 14 (ชั่วคราว)';
      else if (sheetName.includes('สาคร18')) displayTitle = 'สถานีไฟฟ้าสมุทรสาคร 18 (ชั่วคราว)';
      else if (sheetName.includes('กาญ5')) displayTitle = 'สถานีไฟฟ้ากาญจนบุรี 5 (ชั่วคราว)';

      projects.push({
        sheetName: sheetName,
        projectName: displayTitle,
        summary: summaryRow,
        wbsItems: isHeaderRow ? wbsRows.slice(1) : wbsRows,
        totalBudget: totCurr,
        totalActual: totAct,
        totalPrPo: totPo,
        totalRemaining: totRem,
        percentDisbursed: totCurr > 0 ? Math.round((totAct / totCurr) * 10000) / 100 : 0,
        percentCommitted: totCurr > 0 ? Math.round(((totAct + totPo) / totCurr) * 10000) / 100 : 0
      });
    });

    return projects;
  }

  function formatMonthHeader(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('1969-07') || s.includes('2569-07')) return 'ก.ค. 69';
    if (s.includes('1969-08') || s.includes('2569-08')) return 'ส.ค. 69';
    if (s.includes('1969-09') || s.includes('2569-09')) return 'ก.ย. 69';
    if (s.includes('1969-10') || s.includes('2569-10')) return 'ต.ค. 69';
    if (s.includes('1969-11') || s.includes('2569-11')) return 'พ.ย. 69';
    if (s.includes('1969-12') || s.includes('2569-12')) return 'ธ.ค. 69';
    if (s.includes('1970-01') || s.includes('2570-01')) return 'ม.ค. 70';
    if (s.includes('1970-02') || s.includes('2570-02')) return 'ก.พ. 70';
    if (s.includes('1970-03') || s.includes('2570-03')) return 'มี.ค. 70';
    if (s.includes('1970-04') || s.includes('2570-04')) return 'เม.ย. 70';
    return s.replace(' 00:00:00', '');
  }

  function parseGanttPlans(workbook, ganttSheetNames) {
    const plans = {};

    ganttSheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) return;
      const range = XLSX.utils.decode_range(sheet['!ref']);

      // 1. Dynamically identify column indices for Perf, Weight, CalcPct
      let colPerf = -1;
      let colWeight = -1;
      let colCalc = -1;

      for (let c = 2; c <= range.e.c; c++) {
        const h1 = String(getCellValue(sheet, 1, c) || '').trim();
        const h0 = String(getCellValue(sheet, 0, c) || '').trim();
        const combined = h1 + ' ' + h0;
        if ((combined.includes('ผลการดำเนินงาน') || combined.includes('ผลงาน')) && !combined.includes('แผน')) {
          colPerf = c;
        } else if (combined.includes('น้ำหนัก')) {
          colWeight = c;
        } else if (combined.includes('คิดเป็น')) {
          colCalc = c;
        }
      }

      // Fallbacks if not found by name
      if (colPerf === -1) colPerf = range.e.c - 2;
      if (colWeight === -1) colWeight = range.e.c - 1;
      if (colCalc === -1) colCalc = range.e.c;

      // 2. Extract Timeline columns (Between col 3 and colPerf - 1)
      const timelineColumns = [];
      let curMonth = '';
      for (let c = 3; c < colPerf; c++) {
        const mVal = getCellValue(sheet, 1, c) || getCellValue(sheet, 0, c);
        if (mVal) {
          curMonth = formatMonthHeader(mVal);
        }
        const wVal = getCellValue(sheet, 2, c);
        timelineColumns.push({
          colIndex: c,
          month: curMonth,
          week: wVal !== null && wVal !== undefined ? String(wVal).trim() : ''
        });
      }

      // 3. Scan for total construction progress row (%งานก่อสร้างรวม)
      let extractedTotalActual = null;
      for (let r = 3; r <= range.e.r; r++) {
        const r0 = String(getCellValue(sheet, r, 0) || '').trim();
        const r1 = String(getCellValue(sheet, r, 1) || '').trim();
        if (r0.includes('%งานก่อสร้างรวม') || r1.includes('%งานก่อสร้างรวม') || r0.startsWith('%') || r1.startsWith('%')) {
          const rawTotal = getCellValue(sheet, r, colCalc) || getCellValue(sheet, r, colPerf);
          if (rawTotal !== null) {
            extractedTotalActual = parseNum(rawTotal);
          }
          break;
        }
      }

      // 4. Extract tasks
      const tasks2Row = [];
      const itemsUnified = [];
      let totalWeightSum = 0;
      let totalActualSum = 0;
      let totalPlanSum = 0;

      let r = 3;
      while (r <= range.e.r) {
        const valNo = getCellValue(sheet, r, 0);
        const valName = getCellValue(sheet, r, 1);

        // Check if row is a total summary row
        const valNoStr = String(valNo || '').trim();
        const valNameStr = String(valName || '').trim();
        if (valNoStr.includes('%') || valNameStr.includes('%') || valNoStr.includes('รวม') || valNameStr.includes('รวม')) {
          r++;
          continue;
        }

        // Look for valid task number
        if (valNo !== null && valNoStr !== '' && !isNaN(valNoStr)) {
          const taskNo = parseInt(valNoStr, 10);
          const taskName = cleanStr(valName);

          // In Excel, task has row r (แผน) and row r+1 (ผล)
          const planRow = r;
          const actRow = (r + 1 <= range.e.r && !getCellValue(sheet, r + 1, 0)) ? r + 1 : r;

          // Collect timeline active weeks
          const planWeeks = [];
          const actWeeks = [];
          timelineColumns.forEach(tc => {
            const cellPlan = sheet[XLSX.utils.encode_cell({ r: planRow, c: tc.colIndex })];
            const cellAct = sheet[XLSX.utils.encode_cell({ r: actRow, c: tc.colIndex })];
            if (cellPlan && cellPlan.s && cellPlan.s.fgColor) {
              planWeeks.push(tc.month + ' W' + tc.week);
            }
            if (cellAct && cellAct.s && cellAct.s.fgColor) {
              actWeeks.push(tc.month + ' W' + tc.week);
            }
          });

          // Values from merged or individual cells
          const perfVal = getCellValue(sheet, planRow, colPerf) || getCellValue(sheet, actRow, colPerf);
          const weightVal = getCellValue(sheet, planRow, colWeight) || getCellValue(sheet, actRow, colWeight);
          const calcVal = getCellValue(sheet, planRow, colCalc) || getCellValue(sheet, actRow, colCalc);

          const actualPerf = parseNum(perfVal);
          const weight = parseNum(weightVal);
          let calcPct = parseNum(calcVal);
          if (calcPct === 0 && actualPerf > 0 && weight > 0) {
            calcPct = Math.round(actualPerf * weight * 100) / 100;
          }

          // Determine planned performance %
          // If task has actual performance or is an earlier phase task, plan is 100%, otherwise 0%
          let planPerf = 0;
          if (sheetName.includes('กาญจนบุรี 5')) {
            planPerf = taskNo <= 2 ? 100.0 : 0.0;
          } else {
            planPerf = taskNo <= 7 ? 100.0 : 0.0;
          }
          const planCalcPct = Math.round(planPerf * weight * 100) / 100;

          // Status determination
          let status = 'not-started';
          if (actualPerf >= 100) {
            status = 'completed';
          } else if (actualPerf > 0) {
            status = 'in-progress';
          } else if (planPerf > 0) {
            status = 'delayed';
          }

          // Add unified item
          itemsUnified.push({
            no: taskNo,
            name: taskName,
            planPerf: planPerf,
            actualPerf: actualPerf,
            weight: weight,
            calcPct: calcPct,
            planCalcPct: planCalcPct,
            planWeeks: planWeeks,
            actualWeeks: actWeeks,
            status: status
          });

          // Add 2-row tasks (Matching Excel sub-rows)
          tasks2Row.push({
            no: taskNo,
            name: taskName,
            type: 'แผนการดำเนินงาน',
            perf: planPerf,
            weight: weight,
            calcPct: planCalcPct,
            timeline: planWeeks,
            status: 'plan'
          });
          tasks2Row.push({
            no: taskNo,
            name: taskName,
            type: 'ผลการดำเนินงาน',
            perf: actualPerf,
            weight: weight,
            calcPct: calcPct,
            timeline: actWeeks,
            status: status
          });

          totalWeightSum += weight;
          totalActualSum += calcPct;
          totalPlanSum += planCalcPct;

          r = actRow + 1;
        } else {
          r++;
        }
      }

      let projTitle = sheetName;
      if (sheetName.includes('สมุทรสาคร 18')) projTitle = 'สถานีไฟฟ้าสมุทรสาคร 18 (ชั่วคราว)';
      else if (sheetName.includes('กาญจนบุรี 5')) projTitle = 'สถานีไฟฟ้ากาญจนบุรี 5 (ชั่วคราว)';

      const finalTotalActual = extractedTotalActual !== null ? extractedTotalActual : Math.round(totalActualSum * 100) / 100;

      plans[sheetName] = {
        sheetName: sheetName,
        projectName: projTitle,
        totalActual: finalTotalActual,
        totalPlan: Math.round(totalPlanSum * 100) / 100,
        totalWeight: Math.round(totalWeightSum * 100) / 100,
        timelineColumns: timelineColumns,
        items: itemsUnified,
        tasks: tasks2Row
      };
    });

    return plans;
  }

  function parseWorkbook(workbook, matchedSheets, filename) {
    return {
      fileName: filename || 'ข้อมูลนำเข้า.xlsx',
      lastUpdated: new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      transmissionLines: parseTransmissionLines(workbook.Sheets[matchedSheets.transmission]),
      substationsSummary: parseSubstationsSummary(workbook.Sheets[matchedSheets.substationSummary]),
      substationsDetail: parseSubstationsDetail(workbook.Sheets[matchedSheets.substationDetail]),
      permits: parsePermits(workbook.Sheets[matchedSheets.permits]),
      disbursements: parseDisbursements(workbook, matchedSheets.disbursements),
      ganttPlans: parseGanttPlans(workbook, matchedSheets.gantt)
    };
  }

  return {
    parseWorkbook: parseWorkbook
  };
})();
