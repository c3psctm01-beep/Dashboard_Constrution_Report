/**
 * app.js
 * PEA Construction & Disbursement Dashboard
 * Main application logic, UI rendering, Chart.js integrations, and events
 */

(function () {
  'use strict';

  // Global Application State
  const savedPrefs = window.DashboardStorage ? window.DashboardStorage.loadPreferences() : null;
  let appState = {
    data: null,
    currentTheme: localStorage.getItem('pea_dashboard_theme') || 'light',
    activeTab: (savedPrefs && savedPrefs.activeTab) ? savedPrefs.activeTab : 'tab-overview',
    disbSelectedProjectIndex: (savedPrefs && typeof savedPrefs.disbSelectedProjectIndex !== 'undefined') ? savedPrefs.disbSelectedProjectIndex : 0,
    ganttSelectedSheet: (savedPrefs && savedPrefs.ganttSelectedSheet) ? savedPrefs.ganttSelectedSheet : '',
    ganttViewMode: 'consolidated',
    permitFilter: (savedPrefs && savedPrefs.permitFilter) ? savedPrefs.permitFilter : 'all',
    charts: {
      overviewProgress: null,
      overviewBudget: null,
      transMonthly: null,
      disbDetail: null
    }
  };

  // Formatters
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return Number(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPercent(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '0%';
    return Number(pct).toFixed(1) + '%';
  }

  function formatKm(km) {
    if (km === null || km === undefined || isNaN(km)) return '0.00';
    return Number(km).toFixed(2);
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info';
    toast.innerHTML = `
      <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    lucide.createIcons({ root: toast });

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Theme Management
  function initTheme() {
    const html = document.documentElement;
    html.setAttribute('data-theme', appState.currentTheme);
    updateThemeIcon();

    const btnTheme = document.getElementById('btnThemeToggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        appState.currentTheme = appState.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('pea_dashboard_theme', appState.currentTheme);
        html.setAttribute('data-theme', appState.currentTheme);
        updateThemeIcon();
        updateAllCharts();
      });
    }
  }

  function updateThemeIcon() {
    const iconContainer = document.getElementById('themeIcon');
    if (!iconContainer) return;
    const isDark = appState.currentTheme === 'dark';
    iconContainer.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    lucide.createIcons();
  }

  // Tabs Navigation
  function switchTab(targetTab) {
    if (!targetTab) return;
    const tabs = document.querySelectorAll('.dashboard-nav-tabs .nav-tab');
    const tab = Array.from(tabs).find(t => t.getAttribute('data-tab') === targetTab);
    if (!tab) return;

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.tab-content-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    const activePanel = document.getElementById(targetTab);
    if (activePanel) {
      activePanel.classList.add('active');
    }

    appState.activeTab = targetTab;
    if (window.DashboardStorage) {
      window.DashboardStorage.savePreferences({ activeTab: targetTab });
    }
    setTimeout(() => updateAllCharts(), 50);
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.dashboard-nav-tabs .nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        if (targetTab) switchTab(targetTab);
      });
    });

    if (appState.activeTab && appState.activeTab !== 'tab-overview') {
      switchTab(appState.activeTab);
    }
  }

  // File Upload Handling
  function initDropzone() {
    const btnUpload = document.getElementById('btnUploadExcel');
    const fileInput = document.getElementById('excelFileInput');

    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener('change', e => {
        if (e.target.files.length > 0) {
          processUploadedFile(e.target.files[0]);
          fileInput.value = ''; // reset so same file can be re-uploaded if desired
        }
      });
    }

    // Allow drag and drop on window
    window.addEventListener('dragover', e => {
      e.preventDefault();
    });
    window.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        processUploadedFile(e.dataTransfer.files[0]);
      }
    });

    // Reset default button
    const btnReset = document.getElementById('btnResetDefault');
    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        if (window.DEFAULT_DASHBOARD_DATA) {
          if (window.DashboardStorage) {
            await window.DashboardStorage.clearLatestData();
          }
          appState.data = JSON.parse(JSON.stringify(window.DEFAULT_DASHBOARD_DATA));
          appState.data.isCustomUpload = false;
          renderAll();
          showToast('รีเซ็ตเป็นข้อมูลเริ่มต้น และล้างสถานะไฟล์ที่บันทึกไว้เรียบร้อยแล้ว', 'success');
        }
      });
    }

    // Print button
    const btnPrint = document.getElementById('btnPrintReport');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => window.print());
    }

    // Validation modal close
    const btnCloseModal = document.getElementById('btnCloseValidationModal');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => {
        document.getElementById('validationModal').classList.remove('active');
      });
    }

    // Detail modal close
    const btnCloseDetail = document.getElementById('btnCloseDetailModal');
    if (btnCloseDetail) {
      btnCloseDetail.addEventListener('click', () => {
        document.getElementById('detailModal').classList.remove('active');
      });
    }

    // Station list modal close
    const btnCloseStationList = document.getElementById('btnCloseStationListModal');
    if (btnCloseStationList) {
      btnCloseStationList.addEventListener('click', () => {
        document.getElementById('stationListModal').classList.remove('active');
      });
    }

    // View all 30 stations button
    const btnViewAllSub = document.getElementById('btnViewAllSubstations');
    if (btnViewAllSub) {
      btnViewAllSub.addEventListener('click', () => {
        window.openStationModal('all', 'all');
      });
    }

    // Station modal live search
    const stationSearch = document.getElementById('stationModalSearch');
    if (stationSearch) {
      stationSearch.addEventListener('input', (e) => {
        stationModalFilter.search = e.target.value;
        renderStationModal();
      });
    }

    // Click outside modal to close
    window.addEventListener('click', (e) => {
      const stationModal = document.getElementById('stationListModal');
      if (stationModal && e.target === stationModal) {
        stationModal.classList.remove('active');
      }
      const detailModal = document.getElementById('detailModal');
      if (detailModal && e.target === detailModal) {
        detailModal.classList.remove('active');
      }
      const valModal = document.getElementById('validationModal');
      if (valModal && e.target === valModal) {
        valModal.classList.remove('active');
      }
    });
  }

  function processUploadedFile(file) {
    const validExtensions = ['.xlsx', '.xls'];
    const fileName = file.name.toLowerCase();
    const isExcel = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isExcel) {
      showValidationErrors(['ไฟล์ที่เลือกไม่ใช่นามสกุล .xlsx หรือ .xls โปรดเลือกไฟล์ Excel เท่านั้น']);
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // 1. Strict Validation
        const validation = ExcelValidator.validateWorkbook(workbook);

        if (!validation.isValid) {
          showValidationErrors(validation.errors);
          showToast('ไม่สามารถอัปโหลดได้: รูปแบบไฟล์ไม่ถูกต้อง', 'error');
          return;
        }

        // 2. Parse Workbook
        const parsedData = ExcelParser.parseWorkbook(workbook, validation.matchedSheets, file.name);
        parsedData.isCustomUpload = true;
        appState.data = parsedData;

        // 3. Persist to Storage
        if (window.DashboardStorage) {
          await window.DashboardStorage.saveLatestData(parsedData);
        }

        renderAll();
        showToast(`อัปโหลดไฟล์ "${file.name}" สำเร็จ และบันทึกสถานะล่าสุดไว้ในระบบแล้ว`, 'success');
      } catch (err) {
        console.error('Error processing Excel file:', err);
        showValidationErrors(['เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message]);
        showToast('เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function showValidationErrors(errors) {
    const modal = document.getElementById('validationModal');
    const errorList = document.getElementById('validationErrorList');
    if (!modal || !errorList) return;

    errorList.innerHTML = errors.map(err => `
      <li class="validation-error-item">
        <i data-lucide="x-circle" style="width: 18px; height: 18px; flex-shrink: 0;"></i>
        <span>${err}</span>
      </li>
    `).join('');

    lucide.createIcons({ root: errorList });
    modal.classList.add('active');
  }

  // Render Everything
  function renderAll() {
    if (!appState.data) return;

    renderHeaderAndKPIs();
    renderOverviewTab();
    renderTransmissionTab();
    renderSubstationsTab();
    renderDisbursementTab();
    renderPermitsTab();
    renderGanttTab();

    lucide.createIcons();
  }

  // Header & KPI Summary
  function renderHeaderAndKPIs() {
    const d = appState.data;

    // Header info
    document.getElementById('activeFileName').textContent = `${d.fileName} (${d.lastUpdated})`;

    const sourceBadge = document.getElementById('fileDataSourceBadge');
    if (sourceBadge) {
      if (d.isCustomUpload) {
        sourceBadge.className = 'badge-source badge-source-saved';
        sourceBadge.title = 'ระบบกำลังแสดงผลและจดจำสถานะตามไฟล์ล่าสุดที่อัปโหลดไว้';
        sourceBadge.innerHTML = `<i data-lucide="hard-drive" style="width: 12px; height: 12px;"></i> ไฟล์ล่าสุดที่บันทึกไว้`;
      } else {
        sourceBadge.className = 'badge-source badge-source-default';
        sourceBadge.title = 'ข้อมูลตัวอย่างเริ่มต้นของระบบ';
        sourceBadge.innerHTML = `<i data-lucide="bookmark" style="width: 12px; height: 12px;"></i> ข้อมูลเริ่มต้น`;
      }
    }

    // Tab badges
    const transCount = d.transmissionLines ? d.transmissionLines.length : 0;
    const subCount = d.substationsDetail ? d.substationsDetail.length : 0;
    const permitCount = d.permits ? d.permits.length : 0;

    document.getElementById('badgeTransCount').textContent = transCount;
    document.getElementById('badgeSubCount').textContent = subCount;
    document.getElementById('badgePermitCount').textContent = permitCount;

    // KPI 1: Transmission
    const avgTransProgress = transCount > 0
      ? (d.transmissionLines.reduce((acc, cur) => acc + cur.totalProgress, 0) / transCount).toFixed(1)
      : '0';
    document.getElementById('kpiTransCount').textContent = `${transCount} งาน`;
    document.getElementById('kpiTransProgress').textContent = `ความก้าวหน้าเฉลี่ย ${avgTransProgress}%`;

    // KPI 2: Substations
    const subCompleted = d.substationsDetail.filter(s => s.progress >= 100).length;
    const subInProgress = transCount > 0 ? d.substationsDetail.length - subCompleted : 0;
    document.getElementById('kpiSubCount').textContent = `${subCount} แห่ง`;
    document.getElementById('kpiSubStatus').textContent = `เสร็จแล้ว ${subCompleted} แห่ง / ระหว่างก่อสร้าง ${subInProgress} แห่ง`;

    // KPI 3: Permits
    const permitsApproved = d.permits.filter(p => p.statusGroup === 'approved').length;
    const permitsPending = d.permits.filter(p => p.statusGroup === 'pending').length;
    const permitsRevising = d.permits.filter(p => p.statusGroup === 'revising').length;
    document.getElementById('kpiPermitApproved').textContent = `${permitsApproved} / ${permitCount} งาน`;
    document.getElementById('kpiPermitPending').textContent = `อนุมัติแล้ว (รอพิจารณา ${permitsPending}, แก้ไข ${permitsRevising})`;
  }

  // Tab 1: Overview
  function renderOverviewTab() {
    const d = appState.data;

    // Active Table
    const tableBody = document.getElementById('overviewActiveTableBody');
    if (!tableBody) return;

    let rowsHtml = '';

    // Add active transmission lines
    d.transmissionLines.forEach(item => {
      const isComplete = item.totalProgress >= 100;
      rowsHtml += `
        <tr>
          <td><span class="badge-status ${isComplete ? 'completed' : 'wbs-rel'}">สายส่ง 115 kV</span></td>
          <td class="cell-multiline cell-bold">${item.name} <br><small style="color:var(--text-muted);">${item.project} (${formatKm(item.circuitKm)} วงจร-กม.)</small></td>
          <td>${item.builder}</td>
          <td>
            <div class="progress-container">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill ${isComplete ? 'success' : 'warning'}" style="width: ${item.totalProgress}%;"></div>
              </div>
              <span class="progress-pct">${item.totalProgress}%</span>
            </div>
          </td>
          <td class="cell-multiline" style="font-size: 0.82rem; color: var(--text-secondary);">${item.remarks.replace(/\n/g, '<br>')}</td>
        </tr>
      `;
    });

    // Add active substations
    d.substationsDetail.forEach(item => {
      const isComplete = item.progress >= 100;
      rowsHtml += `
        <tr>
          <td><span class="badge-status ${isComplete ? 'completed' : 'wbs-crtd'}">สถานีไฟฟ้า</span></td>
          <td class="cell-multiline cell-bold">${item.name} <br><small style="color:var(--text-muted);">${item.project} (WBS: ${item.wbs})</small></td>
          <td>${item.contractor}</td>
          <td>
            <div class="progress-container">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill ${isComplete ? 'success' : 'warning'}" style="width: ${item.progress}%;"></div>
              </div>
              <span class="progress-pct">${item.progress}%</span>
            </div>
          </td>
          <td class="cell-multiline" style="font-size: 0.82rem; color: var(--text-secondary);">${item.statusText.replace(/\n/g, '<br>')}</td>
        </tr>
      `;
    });

    tableBody.innerHTML = rowsHtml;

    renderOverviewCharts();
  }

  function renderOverviewCharts() {
    const d = appState.data;
    const isDark = appState.currentTheme === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    // Chart 1: Progress Comparison
    const ctxProg = document.getElementById('overviewProgressChart');
    if (ctxProg) {
      if (appState.charts.overviewProgress) appState.charts.overviewProgress.destroy();

      const labels = [];
      const values = [];

      function formatBarLabel(str) {
        if (!str || str.length <= 38) return str;
        const mid = Math.floor(str.length / 2);
        let splitIdx = str.indexOf(' - ', mid - 16);
        if (splitIdx !== -1 && splitIdx < mid + 16) {
          return [str.substring(0, splitIdx), str.substring(splitIdx + 3)];
        }
        splitIdx = str.indexOf(')-', mid - 16);
        if (splitIdx !== -1 && splitIdx < mid + 16) {
          return [str.substring(0, splitIdx + 1), str.substring(splitIdx + 2)];
        }
        return str;
      }

      d.transmissionLines.forEach(item => {
        labels.push(formatBarLabel(item.name));
        values.push(item.totalProgress);
      });
      d.substationsDetail.forEach(item => {
        labels.push(formatBarLabel(item.name));
        values.push(item.progress);
      });

      appState.charts.overviewProgress = new Chart(ctxProg, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'ผลงานความก้าวหน้า (%)',
            data: values,
            backgroundColor: values.map(v => v >= 100 ? '#10b981' : v > 50 ? '#8b5cf6' : '#f59e0b'),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          layout: {
            padding: {
              left: 10,
              right: 15,
              top: 8,
              bottom: 8
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: function(items) {
                  if (!items || !items[0]) return '';
                  const rawLabel = items[0].label;
                  return Array.isArray(rawLabel) ? rawLabel.join(' - ') : rawLabel;
                },
                label: function(context) {
                  return ` ผลงานความก้าวหน้า: ${context.parsed.x}%`;
                }
              }
            }
          },
          scales: {
            x: {
              max: 100,
              ticks: {
                color: textColor,
                callback: function(val) { return val + '%'; }
              },
              grid: { color: gridColor }
            },
            y: {
              ticks: {
                color: textColor,
                font: { family: 'Prompt', size: 12 },
                autoSkip: false,
                padding: 10
              },
              grid: { color: gridColor }
            }
          }
        }
      });
    }
  }

  // Tab 2: Transmission Lines
  function renderTransmissionTab() {
    const d = appState.data;
    const tableBody = document.getElementById('transTableBody');
    const projectFilter = document.getElementById('filterTransProject');
    const searchInput = document.getElementById('searchTransInput');

    if (!tableBody) return;

    // Populate filter options if empty
    if (projectFilter && projectFilter.options.length <= 1) {
      const projects = [...new Set(d.transmissionLines.map(t => t.project).filter(Boolean))];
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        projectFilter.appendChild(opt);
      });

      projectFilter.addEventListener('change', filterTransTable);
      if (searchInput) searchInput.addEventListener('input', filterTransTable);
    }

    function filterTransTable() {
      const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const selectedProj = projectFilter ? projectFilter.value : 'all';

      const filtered = d.transmissionLines.filter(item => {
        const matchesProj = selectedProj === 'all' || item.project === selectedProj;
        const matchesSearch = !searchVal ||
          item.name.toLowerCase().includes(searchVal) ||
          item.project.toLowerCase().includes(searchVal) ||
          item.builder.toLowerCase().includes(searchVal) ||
          item.remarks.toLowerCase().includes(searchVal);
        return matchesProj && matchesSearch;
      });

      tableBody.innerHTML = filtered.map(item => {
        const isComplete = item.totalProgress >= 100;
        // monthly preview
        const monthlyCols = Object.entries(item.monthly2569)
          .filter(([m, v]) => v > 0)
          .map(([m, v]) => `<span style="display:inline-block; margin-right:4px; font-size:0.75rem; background:var(--bg-secondary); padding:1px 4px; border-radius:4px;">${m}: <b>${v}%</b></span>`)
          .join('');

        return `
          <tr>
            <td>${item.no}</td>
            <td><span class="badge-status wbs-rel">${item.project}</span></td>
            <td class="cell-multiline cell-bold">${item.name}</td>
            <td class="cell-num">${formatKm(item.circuitKm)}</td>
            <td>${item.builder}</td>
            <td class="cell-num">${item.progress2568}%</td>
            <td style="white-space:normal; max-width: 200px;">${monthlyCols || '-'}</td>
            <td>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill ${isComplete ? 'success' : 'warning'}" style="width: ${item.totalProgress}%;"></div>
                </div>
                <span class="progress-pct">${item.totalProgress}%</span>
              </div>
            </td>
            <td class="cell-multiline" style="font-size:0.82rem; color:var(--text-secondary);">${item.remarks.replace(/\n/g, '<br>')}</td>
          </tr>
        `;
      }).join('');
    }

    filterTransTable();
    renderTransmissionMonthlyChart();
  }

  function renderTransmissionMonthlyChart() {
    const d = appState.data;
    const ctx = document.getElementById('transMonthlyChart');
    if (!ctx) return;
    if (appState.charts.transMonthly) appState.charts.transMonthly.destroy();

    const isDark = appState.currentTheme === 'dark';
    const textColor = isDark ? '#cbd5e1' : '#475569';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const palette = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];

    const datasets = d.transmissionLines.map((item, idx) => ({
      label: item.name.length > 20 ? item.name.substring(0, 18) + '...' : item.name,
      data: months.map(m => item.monthly2569[m] || 0),
      borderColor: palette[idx % palette.length],
      backgroundColor: palette[idx % palette.length],
      tension: 0.3,
      fill: false,
      borderWidth: 2
    }));

    appState.charts.transMonthly = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { family: 'Prompt' } }
          }
        },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: {
            ticks: { color: textColor },
            grid: { color: gridColor },
            title: { display: true, text: 'ผลงานรายเดือน (%)', color: textColor }
          }
        }
      }
    });
  }

  let stationModalFilter = {
    projectName: 'all',
    status: 'all',
    search: ''
  };

  function ensureSubstationsEnriched(d) {
    if (!d || !d.substationsSummary || !d.substationsSummary.programs) return;
    const defaultPrograms = window.DEFAULT_DASHBOARD_DATA && window.DEFAULT_DASHBOARD_DATA.substationsSummary
      ? window.DEFAULT_DASHBOARD_DATA.substationsSummary.programs
      : null;

    if (!defaultPrograms) return;

    d.substationsSummary.programs.forEach(prog => {
      if (!prog.stations || prog.stations.length === 0) {
        const matched = defaultPrograms.find(dp => dp.name === prog.name);
        if (matched && matched.stations) {
          prog.stations = JSON.parse(JSON.stringify(matched.stations));
        }
      }
    });
  }

  // Tab 3: Substations
  function renderSubstationsTab() {
    const d = appState.data;
    if (!d) return;

    ensureSubstationsEnriched(d);

    // Macro Summary Table
    const sumTableBody = document.getElementById('subSummaryTableBody');
    const sumTableFoot = document.getElementById('subSummaryTableFoot');
    if (sumTableBody && d.substationsSummary && d.substationsSummary.programs) {
      let totTarget = 0, totCompleted = 0, totInProgress = 0, totProcuring = 0;

      sumTableBody.innerHTML = d.substationsSummary.programs.map(p => {
        totTarget += p.target || 0;
        totCompleted += p.completed || 0;
        totInProgress += p.inProgress || 0;
        totProcuring += p.procuring || 0;

        const targetBtn = `<button type="button" class="btn-stat-count target" onclick="window.openStationModal('${p.name}', 'all')" title="คลิกดูรายชื่อสถานีทั้งหมดในโครงการ ${p.name} (${p.target} สถานี)">${p.target} <i data-lucide="chevron-right" style="width:13px;height:13px;"></i></button>`;

        const completedBtn = p.completed > 0
          ? `<button type="button" class="btn-stat-count completed" onclick="window.openStationModal('${p.name}', 'completed')" title="คลิกดูสถานีที่ก่อสร้างแล้วเสร็จในโครงการ ${p.name} (${p.completed} สถานี)">${p.completed} <i data-lucide="check-circle-2" style="width:13px;height:13px;"></i></button>`
          : `<span class="stat-count-zero">-</span>`;

        const inProgressBtn = p.inProgress > 0
          ? `<button type="button" class="btn-stat-count in-progress" onclick="window.openStationModal('${p.name}', 'inProgress')" title="คลิกดูสถานีที่อยู่ระหว่างดำเนินการในโครงการ ${p.name} (${p.inProgress} สถานี)">${p.inProgress} <i data-lucide="clock" style="width:13px;height:13px;"></i></button>`
          : `<span class="stat-count-zero">-</span>`;

        const procuringBtn = p.procuring > 0
          ? `<button type="button" class="btn-stat-count procuring" onclick="window.openStationModal('${p.name}', 'procuring')" title="คลิกดูสถานีที่รอจัดจ้างในโครงการ ${p.name} (${p.procuring} สถานี)">${p.procuring} <i data-lucide="hourglass" style="width:13px;height:13px;"></i></button>`
          : `<span class="stat-count-zero">-</span>`;

        return `
          <tr>
            <td class="cell-bold">${p.name}</td>
            <td class="cell-num">${targetBtn}</td>
            <td class="cell-num">${completedBtn}</td>
            <td class="cell-num">${inProgressBtn}</td>
            <td class="cell-num">${procuringBtn}</td>
            <td class="cell-multiline" style="font-size:0.82rem; color:var(--text-secondary);">${p.notes || '-'}</td>
          </tr>
        `;
      }).join('');

      if (sumTableFoot) {
        sumTableFoot.innerHTML = `
          <tr class="sub-summary-footer">
            <td class="cell-bold">ยอดรวมทั้งหมด</td>
            <td class="cell-num">
              <button type="button" class="btn-stat-count target font-bold" onclick="window.openStationModal('all', 'all')" title="คลิกดูรายชื่อสถานีทั้งหมด 30 สถานี">
                ${totTarget} แห่ง <i data-lucide="layout-list" style="width:13px;height:13px;"></i>
              </button>
            </td>
            <td class="cell-num">
              <button type="button" class="btn-stat-count completed font-bold" onclick="window.openStationModal('all', 'completed')" title="คลิกดูสถานีที่แล้วเสร็จทั้งหมด (${totCompleted} แห่ง)">
                ${totCompleted} แห่ง <i data-lucide="check-circle-2" style="width:13px;height:13px;"></i>
              </button>
            </td>
            <td class="cell-num">
              ${totInProgress > 0 ? `
                <button type="button" class="btn-stat-count in-progress font-bold" onclick="window.openStationModal('all', 'inProgress')" title="คลิกดูสถานีที่อยู่ระหว่างดำเนินการทั้งหมด (${totInProgress} แห่ง)">
                  ${totInProgress} แห่ง <i data-lucide="clock" style="width:13px;height:13px;"></i>
                </button>
              ` : '<span class="stat-count-zero">-</span>'}
            </td>
            <td class="cell-num">
              ${totProcuring > 0 ? `
                <button type="button" class="btn-stat-count procuring font-bold" onclick="window.openStationModal('all', 'procuring')" title="คลิกดูสถานีที่รอจัดจ้างทั้งหมด (${totProcuring} แห่ง)">
                  ${totProcuring} แห่ง <i data-lucide="hourglass" style="width:13px;height:13px;"></i>
                </button>
              ` : '<span class="stat-count-zero">-</span>'}
            </td>
            <td style="font-size:0.82rem; color:var(--text-secondary); font-weight:normal;">รวมทั้งสิ้น 30 สถานีในพื้นที่ กฟก.3</td>
          </tr>
        `;
      }

      lucide.createIcons({ root: sumTableBody });
      if (sumTableFoot) lucide.createIcons({ root: sumTableFoot });
    }

    // Active Substations Detail Table
    const detailTableBody = document.getElementById('subDetailTableBody');
    const searchInput = document.getElementById('searchSubInput');

    if (detailTableBody) {
      function filterSubTable() {
        const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const filtered = d.substationsDetail.filter(item => {
          return !searchVal ||
            item.name.toLowerCase().includes(searchVal) ||
            item.project.toLowerCase().includes(searchVal) ||
            item.wbs.toLowerCase().includes(searchVal) ||
            item.contractor.toLowerCase().includes(searchVal) ||
            item.statusText.toLowerCase().includes(searchVal);
        });

        detailTableBody.innerHTML = filtered.map(item => {
          const isComplete = item.progress >= 100;
          return `
            <tr>
              <td>${item.no}</td>
              <td><span class="badge-status wbs-rel">${item.project}</span></td>
              <td class="cell-bold">${item.name}</td>
              <td style="font-family:monospace; font-size:0.82rem;">${item.wbs}</td>
              <td>${item.contractor}</td>
              <td style="font-size:0.82rem;">${item.contract}<br><small style="color:var(--text-muted);">${item.duration ? item.duration + ' วัน' : ''}</small></td>
              <td>
                <div class="progress-container">
                  <div class="progress-bar-bg">
                    <div class="progress-bar-fill ${isComplete ? 'success' : 'warning'}" style="width: ${item.progress}%;"></div>
                  </div>
                  <span class="progress-pct">${item.progress}%</span>
                </div>
              </td>
              <td style="font-size:0.82rem; white-space:normal; max-width:180px;">${item.supervisor.replace(/\n/g, '<br>') || '-'}</td>
              <td class="cell-multiline" style="font-size:0.82rem; color:var(--text-secondary);">${item.statusText.replace(/\n/g, '<br>')}</td>
            </tr>
          `;
        }).join('');
      }

      if (searchInput) searchInput.addEventListener('input', filterSubTable);
      filterSubTable();
    }
  }

  window.openStationModal = function (projectName = 'all', statusFilter = 'all') {
    const d = appState.data;
    if (!d || !d.substationsSummary) return;

    ensureSubstationsEnriched(d);

    stationModalFilter.projectName = projectName;
    stationModalFilter.status = statusFilter;
    stationModalFilter.search = '';

    const searchInput = document.getElementById('stationModalSearch');
    if (searchInput) searchInput.value = '';

    renderStationModal();

    const modal = document.getElementById('stationListModal');
    if (modal) modal.classList.add('active');
  };

  function renderStationModal() {
    const d = appState.data;
    if (!d || !d.substationsSummary || !d.substationsSummary.programs) return;

    const modalTitle = document.getElementById('stationListModalTitle');
    const modalSubtitle = document.getElementById('stationListModalSubtitle');
    const pillsContainer = document.getElementById('stationModalPills');
    const cardsContainer = document.getElementById('stationCardsContainer');

    // 1. Gather all stations matching project filter
    let allRelevantStations = [];
    d.substationsSummary.programs.forEach(prog => {
      if (stationModalFilter.projectName === 'all' || prog.name === stationModalFilter.projectName) {
        (prog.stations || []).forEach(st => {
          allRelevantStations.push({
            ...st,
            projectName: prog.name
          });
        });
      }
    });

    // Counts for pills
    const countAll = allRelevantStations.filter(s => s.status !== 'cancelled').length;
    const countCompleted = allRelevantStations.filter(s => s.status === 'completed').length;
    const countInProgress = allRelevantStations.filter(s => s.status === 'inProgress').length;
    const countProcuring = allRelevantStations.filter(s => s.status === 'procuring').length;
    const countCancelled = allRelevantStations.filter(s => s.status === 'cancelled').length;

    // Set Title and Subtitle
    const projLabel = stationModalFilter.projectName === 'all' ? 'ภาพรวมทุกโครงการ (รวม 30 สถานี)' : `โครงการ ${stationModalFilter.projectName}`;
    let statusLabel = '';
    if (stationModalFilter.status === 'completed') statusLabel = ' - ก่อสร้างแล้วเสร็จ';
    else if (stationModalFilter.status === 'inProgress') statusLabel = ' - อยู่ระหว่างดำเนินการ';
    else if (stationModalFilter.status === 'procuring') statusLabel = ' - รอจัดจ้าง / ดำเนินการ';
    else if (stationModalFilter.status === 'cancelled') statusLabel = ' - ยกเลิกโครงการ';

    if (modalTitle) {
      modalTitle.innerHTML = `<i data-lucide="building-2" style="width: 20px; height: 20px; color: var(--pea-purple);"></i> รายชื่อสถานีไฟฟ้า ${projLabel}${statusLabel}`;
    }
    if (modalSubtitle) {
      modalSubtitle.textContent = `แสดงสถานีไฟฟ้าตามเงื่อนไขที่เลือก (คลิกเลือกสถานะเพื่อกรอง หรือค้นหาชื่อสถานีไฟฟ้าได้)`;
    }

    // Render Filter Pills
    if (pillsContainer) {
      const pills = [
        { id: 'all', label: `ทั้งหมด (${countAll})` },
        { id: 'completed', label: `ก่อสร้างแล้วเสร็จ (${countCompleted})` },
        { id: 'inProgress', label: `อยู่ระหว่างดำเนินการ (${countInProgress})` },
        { id: 'procuring', label: `รอจัดจ้าง (${countProcuring})` }
      ];
      if (countCancelled > 0) {
        pills.push({ id: 'cancelled', label: `ยกเลิก (${countCancelled})` });
      }

      pillsContainer.innerHTML = pills.map(p => `
        <button type="button" class="modal-filter-pill ${stationModalFilter.status === p.id ? 'active' : ''}" data-status="${p.id}">
          ${p.label}
        </button>
      `).join('');

      pillsContainer.querySelectorAll('.modal-filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          stationModalFilter.status = btn.getAttribute('data-status');
          renderStationModal();
        });
      });
    }

    // Filter by status and search
    const searchVal = stationModalFilter.search.toLowerCase().trim();
    const filteredStations = allRelevantStations.filter(st => {
      let matchStatus = true;
      if (stationModalFilter.status !== 'all') {
        matchStatus = st.status === stationModalFilter.status;
      } else {
        matchStatus = st.status !== 'cancelled';
      }

      let matchSearch = true;
      if (searchVal) {
        matchSearch = st.name.toLowerCase().includes(searchVal) ||
                      (st.category && st.category.toLowerCase().includes(searchVal)) ||
                      (st.projectName && st.projectName.toLowerCase().includes(searchVal)) ||
                      (st.notes && st.notes.toLowerCase().includes(searchVal));
      }

      return matchStatus && matchSearch;
    });

    // Render Cards
    if (cardsContainer) {
      if (filteredStations.length === 0) {
        cardsContainer.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 2.5rem; color: var(--text-muted);">
            <i data-lucide="inbox" style="width: 32px; height: 32px; margin-bottom: 0.5rem; opacity: 0.6;"></i>
            <p>ไม่พบสถานีไฟฟ้าที่ตรงตามเงื่อนไข</p>
          </div>
        `;
      } else {
        cardsContainer.innerHTML = filteredStations.map(st => {
          let badgeClass = 'wbs-rel';
          let badgeIcon = 'info';
          if (st.status === 'completed') {
            badgeClass = 'approved';
            badgeIcon = 'check-circle-2';
          } else if (st.status === 'inProgress') {
            badgeClass = 'pending';
            badgeIcon = 'clock';
          } else if (st.status === 'procuring') {
            badgeClass = 'wbs-crtd';
            badgeIcon = 'hourglass';
          } else if (st.status === 'cancelled') {
            badgeClass = 'revising';
            badgeIcon = 'alert-triangle';
          }

          const hasDetail = typeof st.detailIndex === 'number' && d.substationsDetail && d.substationsDetail[st.detailIndex];
          const detailLinkHtml = hasDetail
            ? `<button type="button" class="station-card-link" onclick="window.viewSubstationDetailModal(${st.detailIndex})"><i data-lucide="external-link" style="width: 13px; height: 13px;"></i> ดูรายละเอียดสัญญา / ผู้รับจ้าง / การทดสอบ</button>`
            : '';

          return `
            <div class="station-card">
              <div class="station-card-top">
                <div class="station-card-title">
                  <i data-lucide="zap" style="width: 16px; height: 16px; color: var(--pea-purple); flex-shrink: 0;"></i>
                  <span>${st.name}</span>
                </div>
                <span class="badge-status ${badgeClass}" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">
                  <i data-lucide="${badgeIcon}" style="width: 12px; height: 12px;"></i>
                  ${st.statusLabel}
                </span>
              </div>
              <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                <span class="station-card-category">${st.projectName}</span>
                <span class="station-card-category" style="background: rgba(142,36,170,0.06); border-color: rgba(142,36,170,0.2); color: var(--pea-purple);">${st.category}</span>
              </div>
              <div class="station-card-notes">
                ${st.notes || '-'}
              </div>
              ${detailLinkHtml}
            </div>
          `;
        }).join('');
      }

      lucide.createIcons({ root: cardsContainer });
    }

    if (modalTitle) lucide.createIcons({ root: modalTitle });
  }

  // Hook for opening detailed construction modal from station card
  window.viewSubstationDetailModal = function(idx) {
    const d = appState.data;
    if (!d || !d.substationsDetail || !d.substationsDetail[idx]) return;

    const item = d.substationsDetail[idx];
    const modal = document.getElementById('detailModal');
    const title = document.getElementById('detailModalTitle');
    const body = document.getElementById('detailModalBody');

    if (title) {
      title.innerHTML = `<i data-lucide="building-2" style="width: 20px; height: 20px; color: var(--pea-purple);"></i> รายละเอียด ${item.name}`;
    }

    if (body) {
      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1rem; font-size: 0.9rem;">
          <div style="display: grid; grid-template-columns: 140px 1fr; gap: 0.5rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md);">
            <strong>โครงการ:</strong> <span>${item.project}</span>
            <strong>รหัส WBS:</strong> <span style="font-family:monospace; font-weight:600;">${item.wbs}</span>
            <strong>ผู้รับจ้าง:</strong> <span>${item.contractor}</span>
            <strong>สัญญา:</strong> <span>${item.contract} (${item.duration ? item.duration + ' วัน' : '-'})</span>
            <strong>ความก้าวหน้า:</strong> <span style="color:var(--color-success); font-weight:700;">${item.progress}%</span>
          </div>
          <div>
            <strong style="color:var(--pea-purple);">ผู้ควบคุมงาน:</strong>
            <p style="margin-top: 0.25rem; white-space: pre-line; color: var(--text-secondary);">${item.supervisor || '-'}</p>
          </div>
          ${item.committee ? `
            <div>
              <strong style="color:var(--pea-purple);">คณะกรรมการตรวจรับพัสดุ:</strong>
              <p style="margin-top: 0.25rem; white-space: pre-line; color: var(--text-secondary);">${item.committee}</p>
            </div>
          ` : ''}
          <div>
            <strong style="color:var(--pea-purple);">สถานะงานก่อสร้าง / การทดสอบ:</strong>
            <p style="margin-top: 0.25rem; white-space: pre-line; color: var(--text-secondary); background: rgba(142,36,170,0.05); padding: 0.75rem; border-radius: var(--radius-sm);">${item.statusText || '-'}</p>
          </div>
        </div>
      `;
    }

    if (modal) modal.classList.add('active');
    lucide.createIcons();
  };

  // Tab 4: Disbursement & WBS
  function renderDisbursementTab() {
    const d = appState.data;
    const selectProj = document.getElementById('selectDisbProject');
    const stationsTableBody = document.getElementById('disbStationsSummaryTableBody');
    const wbsTableBody = document.getElementById('wbsTableBody');
    const searchInput = document.getElementById('searchWbsInput');

    if (!d.disbursements || d.disbursements.length === 0) return;

    // Render Substation Summary Table
    if (stationsTableBody) {
      let grandBud = 0;
      let grandAct = 0;
      let grandPo = 0;
      let grandRem = 0;

      d.disbursements.forEach(p => {
        grandBud += p.totalBudget || 0;
        grandAct += p.totalActual || 0;
        grandPo += p.totalPrPo || 0;
        grandRem += p.totalRemaining || 0;
      });

      const grandPct = grandBud > 0 ? (grandAct / grandBud) * 100 : 0;

      let stationsHtml = d.disbursements.map((p, idx) => {
        const isSelected = appState.disbSelectedProjectIndex === idx;
        return `
          <tr style="${isSelected ? 'background-color: var(--pea-gradient-subtle);' : ''}">
            <td class="cell-bold">${p.projectName}</td>
            <td><span class="badge-status wbs-rel" style="font-size:0.75rem;">${p.sheetName}</span></td>
            <td class="cell-num cell-bold">${formatNumber(p.totalBudget)}</td>
            <td class="cell-num" style="color:var(--color-success); font-weight:600;">${formatNumber(p.totalActual)}</td>
            <td class="cell-num" style="color:var(--color-info);">${formatNumber(p.totalPrPo)}</td>
            <td class="cell-num" style="color:var(--color-warning);">${formatNumber(p.totalRemaining)}</td>
            <td class="cell-num font-bold">${formatPercent(p.percentDisbursed)}</td>
            <td>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill ${p.percentDisbursed >= 50 ? 'success' : 'warning'}" style="width: ${Math.min(100, p.percentDisbursed)}%;"></div>
                </div>
                <span class="progress-pct">${p.percentDisbursed.toFixed(1)}%</span>
              </div>
            </td>
            <td>
              <button type="button" class="btn-secondary" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="window.selectDisbStation(${idx})">
                ดู WBS
              </button>
            </td>
          </tr>
        `;
      }).join('');

      // Add Grand Total Row
      stationsHtml += `
        <tr style="background: var(--bg-secondary); font-weight: 700; border-top: 2px solid var(--border-subtle);">
          <td class="cell-bold"><span class="badge-status completed">รวมทุกสถานี (${d.disbursements.length} สถานี)</span></td>
          <td>-</td>
          <td class="cell-num cell-bold" style="color:var(--pea-purple);">${formatNumber(grandBud)}</td>
          <td class="cell-num" style="color:var(--color-success);">${formatNumber(grandAct)}</td>
          <td class="cell-num" style="color:var(--color-info);">${formatNumber(grandPo)}</td>
          <td class="cell-num" style="color:var(--color-warning);">${formatNumber(grandRem)}</td>
          <td class="cell-num">${formatPercent(grandPct)}</td>
          <td>
            <div class="progress-container">
              <div class="progress-bar-bg">
                <div class="progress-bar-fill success" style="width: ${Math.min(100, grandPct)}%;"></div>
              </div>
              <span class="progress-pct">${grandPct.toFixed(1)}%</span>
            </div>
          </td>
          <td>
            <button type="button" class="btn-primary" style="padding:0.25rem 0.65rem; font-size:0.75rem;" onclick="window.selectDisbStation('all')">
              ดูทั้งหมด
            </button>
          </td>
        </tr>
      `;

      stationsTableBody.innerHTML = stationsHtml;
    }

    // Populate select dropdown
    if (selectProj && selectProj.options.length === 0) {
      const allOpt = document.createElement('option');
      allOpt.value = 'all';
      allOpt.textContent = 'ภาพรวมทุกสถานี (รวมทุกโครงการ)';
      selectProj.appendChild(allOpt);

      d.disbursements.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = `${p.projectName} (${p.sheetName})`;
        selectProj.appendChild(opt);
      });

      selectProj.addEventListener('change', () => {
        appState.disbSelectedProjectIndex = selectProj.value === 'all' ? 'all' : parseInt(selectProj.value, 10);
        updateDisbProjectView();
        renderDisbursementTab(); // refresh selected row highlight in summary table
      });

      if (searchInput) searchInput.addEventListener('input', updateWbsTable);
    }

    // Expose select function to global window
    window.selectDisbStation = function (val) {
      appState.disbSelectedProjectIndex = val;
      if (selectProj) selectProj.value = val;
      updateDisbProjectView();
      renderDisbursementTab();
      // Scroll down smoothly to WBS table if specific station chosen
      if (val !== 'all') {
        const wbsSection = document.getElementById('wbsTableBody');
        if (wbsSection) wbsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    updateDisbProjectView();

    function updateDisbProjectView() {
      const isAll = appState.disbSelectedProjectIndex === 'all';

      let currBud = 0;
      let origBud = 0;
      let actTot = 0;
      let prPo = 0;
      let remTot = 0;

      if (isAll) {
        d.disbursements.forEach(p => {
          currBud += p.totalBudget || 0;
          origBud += (p.summary ? p.summary.origBudget : p.totalBudget) || 0;
          actTot += p.totalActual || 0;
          prPo += p.totalPrPo || 0;
          remTot += p.totalRemaining || 0;
        });
      } else {
        const proj = d.disbursements[appState.disbSelectedProjectIndex] || d.disbursements[0];
        if (proj) {
          currBud = proj.totalBudget || 0;
          origBud = proj.summary ? proj.summary.origBudget : proj.totalBudget;
          actTot = proj.totalActual || 0;
          prPo = proj.totalPrPo || 0;
          remTot = proj.totalRemaining || 0;
        }
      }

      const actPct = currBud > 0 ? (actTot / currBud) * 100 : 0;
      const commitPct = currBud > 0 ? ((actTot + prPo) / currBud) * 100 : 0;

      // Update Mini KPIs
      document.getElementById('disbCurrentBudget').textContent = `${formatNumber(currBud)} บาท`;
      document.getElementById('disbOrigBudget').textContent = `งบต้นแบบ: ${formatNumber(origBud)} บาท`;
      document.getElementById('disbActualTotal').textContent = `${formatNumber(actTot)} บาท`;
      document.getElementById('disbActualPct').textContent = `สัดส่วนเบิกจ่าย ${formatPercent(actPct)}`;
      document.getElementById('disbPrPo').textContent = `${formatNumber(prPo)} บาท`;
      document.getElementById('disbCommitPct').textContent = `รวมผูกพัน ${formatPercent(commitPct)}`;
      document.getElementById('disbRemaining').textContent = `${formatNumber(remTot)} บาท`;

      renderDisbChart(isAll);
      updateWbsTable();
    }

    function updateWbsTable() {
      if (!wbsTableBody) return;
      const isAll = appState.disbSelectedProjectIndex === 'all';
      const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';

      let items = [];
      if (isAll) {
        d.disbursements.forEach(p => {
          p.wbsItems.forEach(item => {
            items.push({ ...item, projName: p.projectName, sheetName: p.sheetName });
          });
        });
      } else {
        const proj = d.disbursements[appState.disbSelectedProjectIndex] || d.disbursements[0];
        if (proj) {
          items = proj.wbsItems.map(item => ({ ...item, projName: proj.projectName, sheetName: proj.sheetName }));
        }
      }

      const filtered = items.filter(item => {
        return !searchVal ||
          item.wbs.toLowerCase().includes(searchVal) ||
          item.desc.toLowerCase().includes(searchVal) ||
          item.status.toLowerCase().includes(searchVal) ||
          (item.projName && item.projName.toLowerCase().includes(searchVal));
      });

      wbsTableBody.innerHTML = filtered.map(item => {
        const isRel = item.status.includes('REL');
        const isCrtd = item.status.includes('CRTD');
        const statusBadgeClass = isRel ? 'wbs-rel' : isCrtd ? 'wbs-crtd' : 'approved';
        const pct = item.currBudget > 0 ? (item.actTotal / item.currBudget) * 100 : 0;

        return `
          <tr>
            <td style="font-family:monospace; font-size:0.82rem; font-weight:600;">
              ${item.wbs}
              ${isAll ? `<br><small style="color:var(--text-muted);">${item.sheetName}</small>` : ''}
            </td>
            <td class="cell-multiline cell-bold">
              ${item.desc}
              ${isAll ? `<br><small style="color:var(--pea-purple); font-weight:normal;">${item.projName}</small>` : ''}
            </td>
            <td><span class="badge-status ${statusBadgeClass}" style="font-size:0.72rem;">${item.status.substring(0, 15)}</span></td>
            <td class="cell-num">${formatNumber(item.currBudget)}</td>
            <td class="cell-num" style="color:var(--color-success); font-weight:600;">${formatNumber(item.actTotal)}</td>
            <td class="cell-num" style="color:var(--color-info);">${formatNumber(item.prPo)}</td>
            <td class="cell-num" style="color:var(--color-warning);">${formatNumber(item.remBudget)}</td>
            <td>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill ${pct >= 100 ? 'success' : pct > 0 ? 'warning' : ''}" style="width: ${Math.min(100, pct)}%;"></div>
                </div>
                <span class="progress-pct">${pct.toFixed(1)}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    function renderDisbChart(isAll) {
      const ctx = document.getElementById('disbDetailChart');
      if (!ctx) return;
      if (appState.charts.disbDetail) appState.charts.disbDetail.destroy();

      const isDark = appState.currentTheme === 'dark';
      const textColor = isDark ? '#cbd5e1' : '#475569';
      const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

      let labels = [];
      let budData = [];
      let actData = [];
      let poData = [];

      if (isAll) {
        // Compare the 3 stations side-by-side
        labels = d.disbursements.map(p => p.projectName.replace('สถานีไฟฟ้า', 'สฟฟ.').replace(' (ชั่วคราว)', '(ช)'));
        budData = d.disbursements.map(p => p.totalBudget);
        actData = d.disbursements.map(p => p.totalActual);
        poData = d.disbursements.map(p => p.totalPrPo);
      } else {
        // Compare top 10 items of chosen station
        const proj = d.disbursements[appState.disbSelectedProjectIndex] || d.disbursements[0];
        if (proj) {
          const topItems = proj.wbsItems.slice(0, 10);
          labels = topItems.map(i => i.desc.length > 20 ? i.desc.substring(0, 18) + '...' : i.desc);
          budData = topItems.map(i => i.currBudget);
          actData = topItems.map(i => i.actTotal);
          poData = topItems.map(i => i.prPo);
        }
      }

      appState.charts.disbDetail = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'งบประมาณปัจจุบัน',
              data: budData,
              backgroundColor: '#8b5cf6',
              borderRadius: 4
            },
            {
              label: 'เบิกจ่ายจริง (Act.)',
              data: actData,
              backgroundColor: '#10b981',
              borderRadius: 4
            },
            {
              label: 'ภาระผูกพัน (PR/PO)',
              data: poData,
              backgroundColor: '#0ea5e9',
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { color: textColor, font: { family: 'Prompt' } }
            },
            tooltip: {
              callbacks: {
                label: function (c) {
                  return ` ${c.dataset.label}: ${formatNumber(c.raw)} บาท`;
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: textColor, font: { family: 'Prompt' } }, grid: { display: false } },
            y: {
              ticks: {
                color: textColor,
                callback: function (val) {
                  return (val / 1000000).toFixed(1) + 'M';
                }
              },
              grid: { color: gridColor }
            }
          }
        }
      });
    }
  }

  // Tab 5: Permits Tracking
  function renderPermitsTab() {
    const d = appState.data;
    const tableBody = document.getElementById('permitsTableBody');
    const searchInput = document.getElementById('searchPermitInput');
    const pillsContainer = document.getElementById('permitFilterPills');

    if (!tableBody || !d.permits) return;

    // Update Pill Counts
    const totalAll = d.permits.length;
    const totalSub = d.permits.filter(p => p.workType.includes('สถานี')).length;
    const totalTrans = d.permits.filter(p => p.workType.includes('สายส่ง')).length;
    const totalApproved = d.permits.filter(p => p.statusGroup === 'approved').length;
    const totalPending = d.permits.filter(p => p.statusGroup === 'pending').length;
    const totalRevising = d.permits.filter(p => p.statusGroup === 'revising').length;

    document.getElementById('countPillAll').textContent = totalAll;
    document.getElementById('countPillSub').textContent = totalSub;
    document.getElementById('countPillTrans').textContent = totalTrans;
    document.getElementById('countPillApproved').textContent = totalApproved;
    document.getElementById('countPillPending').textContent = totalPending;
    document.getElementById('countPillRevising').textContent = totalRevising;

    // Filter pills event listeners
    if (pillsContainer && !pillsContainer.hasAttribute('data-initialized')) {
      pillsContainer.setAttribute('data-initialized', 'true');
      const pills = pillsContainer.querySelectorAll('.filter-pill');
      pills.forEach(pill => {
        pill.addEventListener('click', () => {
          pills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          appState.permitFilter = pill.getAttribute('data-filter') || 'all';
          filterPermits();
        });
      });

      if (searchInput) searchInput.addEventListener('input', filterPermits);
    }

    function filterPermits() {
      const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
      const filter = appState.permitFilter;

      const filtered = d.permits.filter(item => {
        let matchesPill = true;
        if (filter === 'substation') matchesPill = item.workType.includes('สถานี');
        else if (filter === 'transmission') matchesPill = item.workType.includes('สายส่ง');
        else if (filter === 'approved') matchesPill = item.statusGroup === 'approved';
        else if (filter === 'pending') matchesPill = item.statusGroup === 'pending';
        else if (filter === 'revising') matchesPill = item.statusGroup === 'revising';

        const matchesSearch = !searchVal ||
          item.projectName.toLowerCase().includes(searchVal) ||
          item.permitDetail.toLowerCase().includes(searchVal) ||
          item.authority.toLowerCase().includes(searchVal) ||
          item.statusText.toLowerCase().includes(searchVal);

        return matchesPill && matchesSearch;
      });

      tableBody.innerHTML = filtered.map(item => {
        const badgeClass = item.statusGroup === 'approved' ? 'approved' : item.statusGroup === 'revising' ? 'revising' : 'pending';
        return `
          <tr>
            <td>${item.no}</td>
            <td><span class="badge-status ${item.workType.includes('สถานี') ? 'wbs-crtd' : 'wbs-rel'}">${item.workType}</span></td>
            <td class="cell-multiline cell-bold">${item.projectName}</td>
            <td class="cell-multiline" style="font-weight:500;">${item.permitDetail}</td>
            <td><span style="font-weight:600; color:var(--pea-purple);">${item.authority}</span></td>
            <td class="cell-multiline">
              <span class="badge-status ${badgeClass}" style="margin-bottom:0.25rem;">${item.statusLabel}</span>
              <div style="font-size:0.82rem; color:var(--text-secondary); line-height:1.4;">${item.statusText.replace(/\n/g, '<br>')}</div>
            </td>
          </tr>
        `;
      }).join('');
    }

    filterPermits();
  }

  // Tab 6: Gantt Schedule
  function renderGanttTab() {
    const d = appState.data;
    const selectGantt = document.getElementById('selectGanttProject');
    if (!selectGantt || !d.ganttPlans) return;

    const sheetKeys = Object.keys(d.ganttPlans);
    if (sheetKeys.length === 0) return;

    // 1. Populate Dropdown
    if (selectGantt.options.length === 0 || selectGantt.options.length !== sheetKeys.length) {
      selectGantt.innerHTML = '';
      sheetKeys.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = d.ganttPlans[key].projectName || key;
        selectGantt.appendChild(opt);
      });

      if (!appState.ganttSelectedSheet || !d.ganttPlans[appState.ganttSelectedSheet]) {
        appState.ganttSelectedSheet = sheetKeys[0];
      }
      selectGantt.value = appState.ganttSelectedSheet;

      selectGantt.addEventListener('change', () => {
        appState.ganttSelectedSheet = selectGantt.value;
        if (window.DashboardStorage) {
          window.DashboardStorage.savePreferences({ ganttSelectedSheet: appState.ganttSelectedSheet });
        }
        updateGanttContent();
      });
    } else {
      selectGantt.value = appState.ganttSelectedSheet || sheetKeys[0];
    }

    // 2. View Switcher event listeners
    const viewButtons = document.querySelectorAll('.gantt-view-btn');
    viewButtons.forEach(btn => {
      if (!btn.dataset.initialized) {
        btn.dataset.initialized = 'true';
        btn.addEventListener('click', () => {
          const view = btn.dataset.ganttView;
          appState.ganttViewMode = view;
          switchGanttView(view);
        });
      }
    });

    function switchGanttView(viewMode) {
      viewButtons.forEach(b => {
        if (b.dataset.ganttView === viewMode) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      const vConsolidated = document.getElementById('ganttViewConsolidated');
      const vExcel = document.getElementById('ganttViewExcel');
      const vTimeline = document.getElementById('ganttViewTimeline');

      if (vConsolidated) vConsolidated.style.display = viewMode === 'consolidated' ? 'block' : 'none';
      if (vExcel) vExcel.style.display = viewMode === 'excel' ? 'block' : 'none';
      if (vTimeline) vTimeline.style.display = viewMode === 'timeline' ? 'block' : 'none';

      lucide.createIcons();
    }

    // Initial view mode
    if (!appState.ganttViewMode) appState.ganttViewMode = 'consolidated';
    switchGanttView(appState.ganttViewMode);

    updateGanttContent();

    function updateGanttContent() {
      const plan = d.ganttPlans[appState.ganttSelectedSheet] || d.ganttPlans[sheetKeys[0]];
      if (!plan) return;

      // Subtitle
      const subTitle = document.getElementById('ganttProjectSubtitle');
      if (subTitle) {
        subTitle.textContent = `${plan.projectName || appState.ganttSelectedSheet} | ตามกรอบเวลาดำเนินงานปี 2569`;
      }

      // 1. KPI Cards
      renderGanttKPIs(plan);

      // 2. View 1: Consolidated Table
      renderConsolidatedTable(plan);

      // 3. View 2: Excel 2-Row Table
      renderExcelTable(plan);

      // 4. View 3: Visual Gantt Timeline
      renderTimelineView(plan);

      lucide.createIcons();
    }

    function renderGanttKPIs(plan) {
      const kpiActual = document.getElementById('kpiGanttActual');
      const kpiPlan = document.getElementById('kpiGanttPlan');
      const kpiWeight = document.getElementById('kpiGanttWeight');
      const kpiDiff = document.getElementById('kpiGanttDiff');
      const kpiStatusBadge = document.getElementById('kpiGanttStatusBadge');
      const kpiItemCount = document.getElementById('kpiGanttItemCount');

      const items = plan.items || [];
      const totalActual = typeof plan.totalActual === 'number' ? plan.totalActual : (items.reduce((s, it) => s + (it.calcPct || 0), 0));
      const totalPlan = typeof plan.totalPlan === 'number' ? plan.totalPlan : (items.reduce((s, it) => s + (it.planCalcPct || 0), 0));
      const totalWeight = typeof plan.totalWeight === 'number' ? plan.totalWeight : (items.reduce((s, it) => s + (it.weight || 0), 0));
      const diff = Math.round((totalActual - totalPlan) * 100) / 100;

      if (kpiActual) kpiActual.textContent = `${totalActual.toFixed(2)}%`;
      if (kpiPlan) kpiPlan.textContent = `${totalPlan.toFixed(2)}%`;
      if (kpiWeight) kpiWeight.textContent = `${(totalWeight * 100).toFixed(0)}% (${totalWeight.toFixed(2)})`;
      if (kpiItemCount) kpiItemCount.textContent = `${items.length} รายการงาน`;

      if (kpiDiff) {
        kpiDiff.textContent = `${Math.abs(diff).toFixed(2)}%`;
        if (diff >= 0) {
          kpiDiff.style.color = 'var(--color-success)';
          if (kpiStatusBadge) {
            kpiStatusBadge.textContent = diff === 0 ? 'เป็นไปตามแผน' : 'เร็วกว่าแผนงาน';
            kpiStatusBadge.style.color = 'var(--color-success)';
          }
        } else {
          kpiDiff.style.color = '#ef4444';
          if (kpiStatusBadge) {
            kpiStatusBadge.textContent = 'ล่าช้ากว่าแผนงาน';
            kpiStatusBadge.style.color = '#ef4444';
          }
        }
      }
    }

    function renderConsolidatedTable(plan) {
      const tbody = document.getElementById('ganttTableBodyConsolidated');
      const tfoot = document.getElementById('ganttTableFootConsolidated');
      if (!tbody) return;

      const items = plan.items || [];

      tbody.innerHTML = items.map(it => {
        const planWeeksStr = (it.planWeeks && it.planWeeks.length > 0) 
          ? formatTimelineRange(it.planWeeks) 
          : '<span style="color:var(--text-muted);">-</span>';
        const actWeeksStr = (it.actualWeeks && it.actualWeeks.length > 0) 
          ? formatTimelineRange(it.actualWeeks) 
          : '<span style="color:var(--text-muted);">-</span>';

        let badgeClass = 'badge-gantt-not-started';
        let badgeText = 'ยังไม่เริ่ม';
        if (it.actualPerf >= 100) {
          badgeClass = 'badge-gantt-completed';
          badgeText = 'เสร็จสมบูรณ์ 100%';
        } else if (it.actualPerf > 0) {
          badgeClass = 'badge-gantt-in-progress';
          badgeText = `ดำเนินการ ${it.actualPerf.toFixed(0)}%`;
        } else if (it.planPerf > 0) {
          badgeClass = 'badge-gantt-delayed';
          badgeText = 'ล่าช้า (ยังไม่เริ่ม)';
        }

        return `
          <tr>
            <td style="text-align: center; font-weight: 600;">${it.no}</td>
            <td class="cell-bold">${it.name}</td>
            <td class="cell-num">${it.weight.toFixed(2)}</td>
            <td class="cell-num" style="color: #2563eb; font-weight: 600;">${it.planPerf.toFixed(0)}%</td>
            <td class="cell-num font-bold" style="color: var(--color-success);">${it.actualPerf.toFixed(0)}%</td>
            <td class="cell-num" style="font-weight: 700; color: var(--color-success);">${it.calcPct.toFixed(2)}%</td>
            <td style="text-align: center;"><span class="badge-gantt-status ${badgeClass}">${badgeText}</span></td>
            <td>
              <div class="dual-progress-wrapper">
                <div class="dual-progress-bar-bg">
                  <div class="dual-progress-bar-plan" style="width: ${Math.min(100, it.planPerf)}%;"></div>
                  <div class="dual-progress-bar-actual" style="width: ${Math.min(100, it.actualPerf)}%;"></div>
                </div>
                <div class="dual-progress-labels">
                  <span class="plan-lbl">แผน ${it.planPerf.toFixed(0)}%</span>
                  <span class="act-lbl">ผล ${it.actualPerf.toFixed(0)}%</span>
                </div>
              </div>
            </td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${planWeeksStr}</td>
            <td style="font-size: 0.8rem; color: var(--color-success); font-weight: 500;">${actWeeksStr}</td>
          </tr>
        `;
      }).join('');

      if (tfoot) {
        const totalActual = typeof plan.totalActual === 'number' ? plan.totalActual : 0;
        const totalPlan = typeof plan.totalPlan === 'number' ? plan.totalPlan : 0;
        const totalWeight = typeof plan.totalWeight === 'number' ? plan.totalWeight : 1.0;

        tfoot.innerHTML = `
          <tr>
            <td colspan="2" style="text-align: right; font-weight: 700; font-size: 0.92rem;">
              %งานก่อสร้างรวม (Total Progress):
            </td>
            <td class="cell-num" style="font-weight: 700;">${totalWeight.toFixed(2)}</td>
            <td class="cell-num" style="font-weight: 700; color: #2563eb;">${totalPlan.toFixed(2)}%</td>
            <td class="cell-num" style="font-weight: 700; color: var(--color-success);">-</td>
            <td class="cell-num" style="font-weight: 800; color: var(--pea-purple); font-size: 0.95rem;">${totalActual.toFixed(2)}%</td>
            <td colspan="4" style="font-weight: 600; color: var(--text-secondary); font-size: 0.82rem;">
              ผลการดำเนินงานสะสมคิดเป็น <strong>${totalActual.toFixed(2)}%</strong> (ตรงกับสูตรในตาราง Excel)
            </td>
          </tr>
        `;
      }
    }

    function renderExcelTable(plan) {
      const tbody = document.getElementById('ganttTableBodyExcel');
      const tfoot = document.getElementById('ganttTableFootExcel');
      if (!tbody) return;

      const items = plan.items || [];

      tbody.innerHTML = items.map(it => {
        const planWeeksStr = (it.planWeeks && it.planWeeks.length > 0) ? formatTimelineRange(it.planWeeks) : '-';
        const actWeeksStr = (it.actualWeeks && it.actualWeeks.length > 0) ? formatTimelineRange(it.actualWeeks) : '-';

        return `
          <tr class="excel-subrow-plan">
            <td rowspan="2" style="text-align: center; font-weight: 700; vertical-align: middle; border-bottom: 2px solid var(--border-subtle);">${it.no}</td>
            <td rowspan="2" class="cell-bold cell-task-name" style="vertical-align: middle; border-bottom: 2px solid var(--border-subtle);">${it.name}</td>
            <td style="text-align: center;">
              <span class="badge-status wbs-rel" style="background: rgba(37, 99, 235, 0.1); color: #2563eb; border-color: rgba(37, 99, 235, 0.25);">
                แผนการดำเนินงาน
              </span>
            </td>
            <td class="cell-num font-bold" style="color: #2563eb;">${it.planPerf.toFixed(0)}%</td>
            <td rowspan="2" class="cell-num" style="vertical-align: middle; font-weight: 600; border-bottom: 2px solid var(--border-subtle);">${it.weight.toFixed(2)}</td>
            <td class="cell-num" style="color: #2563eb;">${it.planCalcPct.toFixed(2)}%</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary);">${planWeeksStr}</td>
            <td>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${it.planPerf}%; background: #2563eb;"></div>
                </div>
                <span class="progress-pct" style="color: #2563eb;">${it.planPerf.toFixed(0)}%</span>
              </div>
            </td>
          </tr>
          <tr class="excel-subrow-actual">
            <td style="text-align: center;">
              <span class="badge-status wbs-crtd" style="background: rgba(16, 185, 129, 0.1); color: var(--color-success); border-color: rgba(16, 185, 129, 0.25);">
                ผลการดำเนินงาน
              </span>
            </td>
            <td class="cell-num font-bold" style="color: var(--color-success);">${it.actualPerf.toFixed(0)}%</td>
            <td class="cell-num" style="font-weight: 700; color: var(--color-success);">${it.calcPct.toFixed(2)}%</td>
            <td style="font-size: 0.8rem; color: var(--color-success); font-weight: 500;">${actWeeksStr}</td>
            <td>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill ${it.actualPerf >= 100 ? 'success' : it.actualPerf > 0 ? 'warning' : ''}" style="width: ${it.actualPerf}%;"></div>
                </div>
                <span class="progress-pct">${it.actualPerf.toFixed(0)}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      if (tfoot) {
        const totalActual = typeof plan.totalActual === 'number' ? plan.totalActual : 0;
        const totalWeight = typeof plan.totalWeight === 'number' ? plan.totalWeight : 1.0;

        tfoot.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: right; font-weight: 700; font-size: 0.92rem;">
              %งานก่อสร้างรวม (ตรงกับแถวสรุปใน Excel):
            </td>
            <td class="cell-num" style="font-weight: 700;">${totalWeight.toFixed(2)}</td>
            <td class="cell-num" style="font-weight: 800; color: var(--pea-purple); font-size: 0.95rem;">${totalActual.toFixed(2)}%</td>
            <td colspan="2" style="font-weight: 600; color: var(--text-secondary); font-size: 0.82rem;">
              สูตรใน Excel: <code>=SUM(...)</code> คิดเป็น <strong>${totalActual.toFixed(2)}%</strong>
            </td>
          </tr>
        `;
      }
    }

    function renderTimelineView(plan) {
      const table = document.getElementById('ganttTimelineTable');
      if (!table) return;

      const timelineCols = plan.timelineColumns || [];
      const items = plan.items || [];
      if (timelineCols.length === 0) {
        table.innerHTML = '<tr><td style="padding: 2rem; color: var(--text-muted);">ไม่มีข้อมูลสัปดาห์ในปฏิทิน</td></tr>';
        return;
      }

      // Group timelineCols by month
      const monthGroups = [];
      timelineCols.forEach(tc => {
        let lastG = monthGroups[monthGroups.length - 1];
        if (!lastG || lastG.month !== tc.month) {
          monthGroups.push({ month: tc.month, count: 1 });
        } else {
          lastG.count++;
        }
      });

      // 1. Build Header Rows
      let theadHtml = `
        <thead>
          <tr>
            <th class="sticky-task-col" rowspan="2">รายการงาน</th>
            <th class="sticky-type-col" rowspan="2">ประเภท</th>
            ${monthGroups.map(g => `<th class="month-header" colspan="${g.count}">${g.month}</th>`).join('')}
            <th rowspan="2" style="width: 75px; background: var(--bg-secondary);">ผลงาน (%)</th>
          </tr>
          <tr>
            ${timelineCols.map(tc => `<th class="week-header">W${tc.week}</th>`).join('')}
          </tr>
        </thead>
      `;

      // 2. Build Body Rows
      let tbodyHtml = '<tbody>';
      items.forEach(it => {
        // Row 1: Plan
        tbodyHtml += `
          <tr class="timeline-row-plan">
            <td class="sticky-task-col" rowspan="2" title="${it.name}">
              <span style="font-weight: 700; color: var(--text-secondary); margin-right: 0.35rem;">${it.no}.</span>
              <strong>${it.name}</strong>
            </td>
            <td class="sticky-type-col" style="color: #ef4444; font-weight: 600;">แผน</td>
            ${timelineCols.map(tc => {
              const weekKey = `${tc.month} W${tc.week}`;
              const isMatch = it.planWeeks && it.planWeeks.some(pw => pw.includes(weekKey) || (pw.includes(tc.month) && pw.includes(`W${tc.week}`)));
              return `<td>${isMatch ? '<span class="gantt-cell-bar plan" title="แผนงาน ' + weekKey + '"></span>' : ''}</td>`;
            }).join('')}
            <td rowspan="2" class="cell-num font-bold" style="vertical-align: middle; background: var(--card-bg); border-bottom: 2px solid var(--border-subtle); color: var(--color-success); font-size: 0.85rem;">
              ${it.actualPerf.toFixed(0)}%
            </td>
          </tr>
          <tr class="timeline-row-actual">
            <td class="sticky-type-col" style="color: #65a30d; font-weight: 600; border-bottom: 2px solid var(--border-subtle);">ผล</td>
            ${timelineCols.map(tc => {
              const weekKey = `${tc.month} W${tc.week}`;
              const isMatch = it.actualWeeks && it.actualWeeks.some(aw => aw.includes(weekKey) || (aw.includes(tc.month) && aw.includes(`W${tc.week}`)));
              return `<td>${isMatch ? '<span class="gantt-cell-bar actual" title="ผลงาน ' + weekKey + '"></span>' : ''}</td>`;
            }).join('')}
          </tr>
        `;
      });
      tbodyHtml += '</tbody>';

      table.innerHTML = theadHtml + tbodyHtml;
    }

    function formatTimelineRange(weeksArray) {
      if (!weeksArray || weeksArray.length === 0) return '-';
      if (weeksArray.length === 1) return weeksArray[0];
      return `${weeksArray[0]} - ${weeksArray[weeksArray.length - 1]}`;
    }
  }

  function updateAllCharts() {
    renderOverviewCharts();
    renderTransmissionMonthlyChart();
    if (appState.data && appState.data.disbursements) {
      const proj = appState.data.disbursements[appState.disbSelectedProjectIndex] || appState.data.disbursements[0];
      if (proj && appState.charts.disbDetail) {
        // Will be updated if tab is active
      }
    }
  }

  // App Initialization
  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initTabs();
    initDropzone();

    let initialData = null;
    let isFromStorage = false;

    // 1. Check if there is saved uploaded data in persistent storage
    if (window.DashboardStorage) {
      try {
        const savedData = await window.DashboardStorage.loadLatestData();
        if (savedData) {
          initialData = savedData;
          isFromStorage = true;
        }
      } catch (err) {
        console.warn('Failed to load saved dashboard data:', err);
      }
    }

    // 2. Fallback to default preloaded dataset
    if (!initialData && window.DEFAULT_DASHBOARD_DATA) {
      initialData = JSON.parse(JSON.stringify(window.DEFAULT_DASHBOARD_DATA));
      initialData.isCustomUpload = false;
    }

    if (initialData) {
      appState.data = initialData;
      renderAll();

      if (isFromStorage) {
        showToast(`โหลดสถานะตามไฟล์ล่าสุด: "${initialData.fileName}" เรียบร้อยแล้ว`, 'info');
      }
    }
  });

})();
