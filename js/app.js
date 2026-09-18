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

  // Tab 3: Substations
  function renderSubstationsTab() {
    const d = appState.data;

    // Macro Summary Table
    const sumTableBody = document.getElementById('subSummaryTableBody');
    if (sumTableBody && d.substationsSummary && d.substationsSummary.programs) {
      sumTableBody.innerHTML = d.substationsSummary.programs.map(p => `
        <tr>
          <td class="cell-bold">${p.name}</td>
          <td class="cell-num">${p.target}</td>
          <td class="cell-num" style="color:var(--color-success); font-weight:600;">${p.completed}</td>
          <td class="cell-num" style="color:var(--color-warning); font-weight:600;">${p.inProgress}</td>
          <td class="cell-num" style="color:var(--text-muted);">${p.procuring}</td>
          <td class="cell-multiline" style="font-size:0.82rem; color:var(--text-secondary);">${p.notes || '-'}</td>
        </tr>
      `).join('');
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
    const tableBody = document.getElementById('ganttTableBody');

    if (!selectGantt || !d.ganttPlans) return;

    const sheetKeys = Object.keys(d.ganttPlans);
    if (sheetKeys.length === 0) return;

    if (selectGantt.options.length === 0) {
      sheetKeys.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = d.ganttPlans[key].projectName || key;
        selectGantt.appendChild(opt);
      });

      appState.ganttSelectedSheet = sheetKeys[0];
      selectGantt.addEventListener('change', () => {
        appState.ganttSelectedSheet = selectGantt.value;
        updateGanttTable();
      });
    }

    updateGanttTable();

    function updateGanttTable() {
      const plan = d.ganttPlans[appState.ganttSelectedSheet] || d.ganttPlans[sheetKeys[0]];
      if (!plan || !tableBody) return;

      tableBody.innerHTML = plan.tasks.map(t => {
        const isPlan = t.type.includes('แผน');
        return `
          <tr>
            <td>${t.no || '-'}</td>
            <td class="cell-bold">${t.name}</td>
            <td><span class="badge-status ${isPlan ? 'wbs-rel' : 'wbs-crtd'}">${t.type}</span></td>
            <td class="cell-num font-bold">${t.perf}%</td>
            <td class="cell-num">${t.weight}</td>
            <td class="cell-num" style="color:var(--color-success); font-weight:600;">${t.calcPct}%</td>
            <td>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill ${t.perf >= 100 ? 'success' : t.perf > 0 ? 'warning' : ''}" style="width: ${t.perf}%;"></div>
                </div>
                <span class="progress-pct">${t.perf}%</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');
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
