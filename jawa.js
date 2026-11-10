/**
 * Sistem Kunjungan Perpustakaan
 * Fitur:
 * 1. Form Kunjungan & Deteksi Jam WIB Real-time
 * 2. Opsi Kelas "DLL" dengan input keterangan fleksibel
 * 3. Dashboard Rekap & Statistik Keaktifan Pengunjung
 * 4. Hak Akses Admin (Hanya admin yang bisa menghapus riwayat per baris maupun semua data)
 * 5. Integrasi Database Google Sheets (Cloud) dengan fallback LocalStorage
 */

// ============================================================================
// 1. KONFIGURASI & STATE
// ============================================================================

// Password Admin Resmi ('perpusnemtas_66')
const ADMIN_PASS_HASHES = ["cGVycHVzbmVtdGFzXzY2"]; // base64 dari 'perpusnemtas_66'

// URL Web App Google Apps Script (Tersimpan di LocalStorage)
let GOOGLE_SCRIPT_URL = localStorage.getItem('lib_sheets_url') || '';

// ============================================================================
// 2. JAM WIB REAL-TIME
// ============================================================================

function updateWIBClock() {
    const now = new Date();
    const options = { 
        timeZone: 'Asia/Jakarta', 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false 
    };
    const formatter = new Intl.DateTimeFormat('id-ID', options);
    const parts = formatter.formatToParts(now);
    
    let dateStr = '', timeStr = '';

    parts.forEach(p => {
        if (p.type === 'day') dateStr += p.value + '/';
        if (p.type === 'month') dateStr += p.value + '/';
        if (p.type === 'year') dateStr += p.value + ', ';
        if (p.type === 'hour') timeStr += p.value + ':';
        if (p.type === 'minute') timeStr += p.value + ':';
        if (p.type === 'second') timeStr += p.value;
    });

    const clockInput = document.getElementById('displayWaktu');
    if (clockInput) {
        clockInput.value = `${dateStr.replace(/,\s$/, '')} ${timeStr} WIB`;
    }
}
setInterval(updateWIBClock, 1000);
updateWIBClock();

// ============================================================================
// 3. NAVIGASI TAB
// ============================================================================

function switchTab(tab) {
    if (tab === 'rekap' && !isAdmin()) {
        alert('Akses terbatas! Dashboard Rekap hanya dapat diakses oleh Admin Perpustakaan.');
        openAdminModal();
        return;
    }

    const formSec = document.getElementById('sectionForm');
    const rekapSec = document.getElementById('sectionRekap');
    const btnForm = document.getElementById('btnForm');
    const btnRekap = document.getElementById('btnRekap');

    if (tab === 'form') {
        formSec.classList.remove('hidden');
        rekapSec.classList.add('hidden');
        btnForm.classList.add('active');
        if (btnRekap) btnRekap.classList.remove('active');
    } else {
        formSec.classList.add('hidden');
        rekapSec.classList.remove('hidden');
        if (btnRekap) btnRekap.classList.add('active');
        btnForm.classList.remove('active');
        updateAdminUI();
        updateDbStatusUI();
        loadDashboardData();
    }
}

// ============================================================================
// 4. PENANGANAN FORM & PILIHAN KELAS "DLL"
// ============================================================================

function handleKelasChange() {
    const kelasSelect = document.getElementById('kelas');
    const kelasLainnyaGroup = document.getElementById('kelasLainnyaGroup');
    const kelasLainnyaInput = document.getElementById('kelasLainnya');

    if (kelasSelect.value === 'DLL') {
        kelasLainnyaGroup.classList.remove('hidden');
        kelasLainnyaInput.focus();
    } else {
        kelasLainnyaGroup.classList.add('hidden');
        kelasLainnyaInput.value = '';
    }
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const nama = document.getElementById('nama').value.trim();
    const kelasSelect = document.getElementById('kelas').value;
    const kelasLainnya = document.getElementById('kelasLainnya').value.trim();
    const tujuan = document.getElementById('tujuan').value;
    const waktu = document.getElementById('displayWaktu').value;

    if (!nama || !kelasSelect || !tujuan) {
        alert('Mohon lengkapi semua isian formulir.');
        return;
    }

    // Tentukan nilai kelas yang disimpan
    let finalKelas = kelasSelect;
    if (kelasSelect === 'DLL') {
        finalKelas = kelasLainnya ? `DLL (${kelasLainnya})` : 'DLL';
    }

    const now = new Date();
    const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
    const uniqueId = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

    const newVisit = { 
        id: uniqueId, 
        nama, 
        kelas: finalKelas, 
        tujuan, 
        waktu, 
        isoDate 
    };

    // 1. Simpan ke LocalStorage langsung (Respons Cepat)
    let visits = getLocalVisits();
    visits.unshift(newVisit);
    saveLocalVisits(visits);

    // 2. Reset Form
    document.getElementById('visitForm').reset();
    document.getElementById('kelasLainnyaGroup').classList.add('hidden');
    updateWIBClock();

    showToast('✅ Kunjungan berhasil dicatat!');

    // 3. Kirim ke Google Sheets di background jika URL terhubung
    if (GOOGLE_SCRIPT_URL) {
        sendVisitToGoogleSheets(newVisit);
    }
}

// ============================================================================
// 5. SISTEM AUTH & HAK AKSES ADMIN
// ============================================================================

function isAdmin() {
    return sessionStorage.getItem('lib_admin_logged') === 'true';
}

function handleAdminBtnClick() {
    if (isAdmin()) {
        if (confirm('Apakah Anda ingin keluar dari Mode Admin?')) {
            logoutAdmin();
        }
    } else {
        openAdminModal();
    }
}

function openAdminModal() {
    const modal = document.getElementById('modalAdmin');
    const input = document.getElementById('adminPasswordInput');
    const errorEl = document.getElementById('adminLoginError');
    
    if (modal) {
        modal.classList.remove('hidden');
        input.value = '';
        errorEl.classList.add('hidden');
        setTimeout(() => input.focus(), 100);
    }
}

function closeAdminModal() {
    const modal = document.getElementById('modalAdmin');
    if (modal) modal.classList.add('hidden');
}

function executeAdminLogin() {
    const input = document.getElementById('adminPasswordInput').value;
    const errorEl = document.getElementById('adminLoginError');

    if (!input) return;

    const inputHash = btoa(input);
    if (ADMIN_PASS_HASHES.includes(inputHash)) {
        sessionStorage.setItem('lib_admin_logged', 'true');
        closeAdminModal();
        updateAdminUI();
        switchTab('rekap'); // Langsung buka tab Dashboard Rekap untuk admin
        showToast('🛡️ Berhasil masuk sebagai Admin!');
    } else {
        errorEl.classList.remove('hidden');
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('lib_admin_logged');
    switchTab('form'); // Kembalikan ke form kunjungan
    updateAdminUI();
    showToast('👋 Keluar dari Mode Admin.');
}

function updateAdminUI() {
    const adminActive = isAdmin();
    const btnAdminNav = document.getElementById('btnAdminNav');
    const badgeAdminMode = document.getElementById('badgeAdminMode');
    const btnHapusSemua = document.getElementById('btnHapusSemua');
    const thAksi = document.getElementById('thAksi');
    const btnRekap = document.getElementById('btnRekap');
    const btnDbConfig = document.getElementById('btnDbConfig');

    // Dashboard Rekap & Pengaturan Database HANYA tampil jika admin sudah login
    if (btnRekap) {
        btnRekap.classList.toggle('hidden', !adminActive);
    }
    if (btnDbConfig) {
        btnDbConfig.classList.toggle('hidden', !adminActive);
    }

    if (btnAdminNav) {
        if (adminActive) {
            btnAdminNav.innerHTML = '🛡️ Admin (Keluar)';
            btnAdminNav.classList.add('logged-in');
        } else {
            btnAdminNav.innerHTML = '🔐 Login Admin';
            btnAdminNav.classList.remove('logged-in');
        }
    }

    if (badgeAdminMode) {
        badgeAdminMode.classList.toggle('hidden', !adminActive);
    }

    if (btnHapusSemua) {
        btnHapusSemua.classList.toggle('hidden', !adminActive);
    }

    if (thAksi) {
        thAksi.classList.toggle('hidden', !adminActive);
    }

    // Jika bukan admin dan saat ini sedang berada di tab rekap, kembalikan ke tab form
    if (!adminActive) {
        const rekapSec = document.getElementById('sectionRekap');
        if (rekapSec && !rekapSec.classList.contains('hidden')) {
            switchTab('form');
        }
    }
}

// ============================================================================
// 6. PENGHAPUSAN RIWAYAT (HANYA BISA DIAKSES ADMIN)
// ============================================================================

// Hapus SATU data riwayat kunjungan (Admin Only)
async function handleDeleteRow(visitId) {
    if (!isAdmin()) {
        alert('Akses ditolak! Hanya admin yang dapat menghapus data kunjungan.');
        openAdminModal();
        return;
    }

    let visits = getLocalVisits();
    const target = visits.find(v => v.id === visitId);
    const targetName = target ? target.nama : 'data ini';

    if (!confirm(`Yakin ingin menghapus riwayat kunjungan atas nama "${targetName}"?`)) {
        return;
    }

    // Hapus dari LocalStorage
    visits = visits.filter(v => v.id !== visitId);
    saveLocalVisits(visits);
    loadDashboardData();
    showToast('🗑️ 1 data riwayat kunjungan berhasil dihapus.');

    // Hapus dari Google Sheets jika terhubung
    if (GOOGLE_SCRIPT_URL) {
        try {
            fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'delete', id: visitId })
            }).catch(err => console.warn('Gagal sync hapus ke Google Sheets:', err));
        } catch (e) {
            console.warn(e);
        }
    }
}

// Buka Modal Konfirmasi Hapus Semua Data (Memerlukan Input Password Admin Lagi)
function resetData() {
    if (!isAdmin()) {
        alert('Akses ditolak! Hanya admin yang dapat mengosongkan riwayat kunjungan.');
        openAdminModal();
        return;
    }
    openConfirmDeleteModal();
}

function openConfirmDeleteModal() {
    const modal = document.getElementById('modalConfirmDeleteAll');
    const input = document.getElementById('confirmDeletePasswordInput');
    const errorEl = document.getElementById('confirmDeleteError');
    if (modal) {
        modal.classList.remove('hidden');
        if (input) input.value = '';
        if (errorEl) errorEl.classList.add('hidden');
        setTimeout(() => { if (input) input.focus(); }, 100);
    }
}

function closeConfirmDeleteModal() {
    const modal = document.getElementById('modalConfirmDeleteAll');
    if (modal) modal.classList.add('hidden');
}

// Eksekusi Hapus Semua Data setelah password diverifikasi
async function executeConfirmDeleteAll() {
    const inputEl = document.getElementById('confirmDeletePasswordInput');
    const errorEl = document.getElementById('confirmDeleteError');
    const inputPass = inputEl ? inputEl.value : '';

    if (!inputPass) {
        if (errorEl) {
            errorEl.innerText = 'Password tidak boleh kosong!';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    const inputHash = btoa(inputPass);
    if (!ADMIN_PASS_HASHES.includes(inputHash)) {
        if (errorEl) {
            errorEl.innerText = 'Password salah! Seluruh data kunjungan batal dihapus.';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    // Password terkonfirmasi benar!
    closeConfirmDeleteModal();

    // 1. Kosongkan dari LocalStorage
    localStorage.removeItem('lib_visits');
    loadDashboardData();
    showToast('🗑️ Seluruh data riwayat kunjungan berhasil dikosongkan.');

    // 2. Kosongkan dari Google Sheets jika terhubung
    if (GOOGLE_SCRIPT_URL) {
        try {
            fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'clearAll' })
            }).catch(err => console.warn('Gagal sync reset ke Google Sheets:', err));
        } catch (e) {
            console.warn(e);
        }
    }
}

// ============================================================================
// 7. DASHBOARD REKAP & PERINGKAT KEAKTIFAN
// ============================================================================

function getLocalVisits() {
    let visits = JSON.parse(localStorage.getItem('lib_visits')) || [];
    // Pastikan semua item memiliki properti id unik
    let modified = false;
    visits.forEach((v, idx) => {
        if (!v.id) {
            v.id = 'v_legacy_' + idx + '_' + (v.isoDate || 'prev');
            modified = true;
        }
    });
    if (modified) {
        localStorage.setItem('lib_visits', JSON.stringify(visits));
    }
    return visits;
}

function saveLocalVisits(visits) {
    localStorage.setItem('lib_visits', JSON.stringify(visits));
}

function loadDashboardData(filteredVisits = null) {
    const visits = filteredVisits || getLocalVisits();
    const adminActive = isAdmin();
    
    // 1. Tampilkan Tabel Riwayat Kunjungan
    const logBody = document.getElementById('logTableBody');
    const thAksi = document.getElementById('thAksi');
    if (thAksi) thAksi.classList.toggle('hidden', !adminActive);

    const colspan = adminActive ? 5 : 4;

    if (visits.length === 0) {
        logBody.innerHTML = `<tr><td colspan="${colspan}" class="text-center" style="color: #94a3b8; padding: 2rem;">Tidak ada data kunjungan ditemukan.</td></tr>`;
    } else {
        logBody.innerHTML = visits.map(v => `
            <tr>
                <td style="font-family: monospace; font-size: 0.8rem; color: #475569;">${escapeHtml(v.waktu)}</td>
                <td style="font-weight: 500;">${escapeHtml(v.nama)}</td>
                <td><span style="background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 0.35rem; font-size: 0.8rem;">${escapeHtml(v.kelas)}</span></td>
                <td>${escapeHtml(v.tujuan)}</td>
                ${adminActive ? `
                <td class="col-aksi-cell">
                    <button onclick="handleDeleteRow('${v.id}')" class="btn-delete-row" title="Hapus kunjungan ini">🗑️ Hapus</button>
                </td>
                ` : ''}
            </tr>
        `).join('');
    }

    // 2. Hitung & Tampilkan Peringkat Keaktifan Pengunjung
    const allVisits = getLocalVisits();
    const summaryMap = {};
    
    allVisits.forEach(v => {
        const cleanNama = (v.nama || '').trim().toLowerCase();
        const cleanKelas = (v.kelas || '').trim().toLowerCase();
        const key = `${cleanNama}__${cleanKelas}`;

        if (!summaryMap[key]) {
            summaryMap[key] = { nama: v.nama, kelas: v.kelas, count: 0 };
        }
        summaryMap[key].count += 1;
    });

    const sortedSummary = Object.values(summaryMap).sort((a, b) => b.count - a.count);
    const rankingBody = document.getElementById('rankingTableBody');
    
    if (sortedSummary.length === 0) {
        rankingBody.innerHTML = `<tr><td colspan="4" class="text-center" style="color: #94a3b8; padding: 2rem;">Belum ada data statistik kunjungan.</td></tr>`;
    } else {
        rankingBody.innerHTML = sortedSummary.map((item, index) => {
            let medal = `#${index + 1}`;
            if (index === 0) medal = '🥇 #1';
            else if (index === 1) medal = '🥈 #2';
            else if (index === 2) medal = '🥉 #3';

            return `
            <tr>
                <td style="font-weight: bold; color: #4f46e5;">${medal}</td>
                <td style="font-weight: 500;">${escapeHtml(item.nama)}</td>
                <td>${escapeHtml(item.kelas)}</td>
                <td class="text-center" style="font-weight: 600; color: #1e293b;">${item.count}x</td>
            </tr>
            `;
        }).join('');
    }
}

function filterByDate() {
    const selectedDate = document.getElementById('filterTanggal').value;
    if (!selectedDate) return;

    const visits = getLocalVisits();
    const filtered = visits.filter(v => v.isoDate === selectedDate);

    document.getElementById('tableTitle').innerText = `📋 Riwayat Kunjungan (${selectedDate})`;
    loadDashboardData(filtered);
}

function resetFilter() {
    document.getElementById('filterTanggal').value = '';
    document.getElementById('tableTitle').innerText = `📋 Riwayat Kunjungan (Semua)`;
    loadDashboardData();
}

// Download Rekap Data Kunjungan ke Format Excel / CSV
function downloadRekapCSV() {
    const filterInput = document.getElementById('filterTanggal');
    const selectedDate = filterInput ? filterInput.value : '';
    let visits = getLocalVisits();

    if (selectedDate) {
        visits = visits.filter(v => v.isoDate === selectedDate);
    }

    if (!visits || visits.length === 0) {
        alert('Tidak ada data kunjungan untuk didownload' + (selectedDate ? ` pada tanggal ${selectedDate}.` : '.'));
        return;
    }

    // Fungsi pembantu membersihkan tanda kutip agar rapi di Excel
    const sanitize = (text) => `"${String(text || '').replace(/"/g, '""')}"`;

    let csvLines = [];
    csvLines.push(['REKAP KUNJUNGAN PERPUSTAKAAN SMKN 6 TANGERANG SELATAN']);
    if (selectedDate) {
        csvLines.push([`Tanggal Rekap: ${selectedDate}`]);
    } else {
        csvLines.push([`Waktu Unduh: ${new Date().toLocaleString('id-ID')}`]);
    }
    csvLines.push([]); // Baris pemisah

    // Header Kolom Data Kunjungan
    csvLines.push(['No', 'Waktu Kunjungan (WIB)', 'Nama Siswa / Pengunjung', 'Kelas', 'Tujuan Datang', 'Tanggal ISO']);

    visits.forEach((v, idx) => {
        csvLines.push([
            idx + 1,
            sanitize(v.waktu),
            sanitize(v.nama),
            sanitize(v.kelas),
            sanitize(v.tujuan),
            sanitize(v.isoDate)
        ]);
    });

    // Tambahkan Rekap Peringkat Keaktifan Pengunjung di bagian bawah
    csvLines.push([]);
    csvLines.push(['--- STATISTIK KEAKTIFAN PENGUNJUNG ---']);
    csvLines.push(['Peringkat', 'Nama Pengunjung', 'Kelas', 'Total Kunjungan']);

    const summaryMap = {};
    visits.forEach(v => {
        const cleanNama = (v.nama || '').trim().toLowerCase();
        const cleanKelas = (v.kelas || '').trim().toLowerCase();
        const key = `${cleanNama}__${cleanKelas}`;
        if (!summaryMap[key]) {
            summaryMap[key] = { nama: v.nama, kelas: v.kelas, count: 0 };
        }
        summaryMap[key].count += 1;
    });

    const sortedSummary = Object.values(summaryMap).sort((a, b) => b.count - a.count);
    sortedSummary.forEach((item, index) => {
        csvLines.push([
            index + 1,
            sanitize(item.nama),
            sanitize(item.kelas),
            `"${item.count}x"`
        ]);
    });

    // Gabungkan baris-baris CSV dengan koma
    const csvContent = csvLines.map(row => row.join(',')).join('\r\n');

    // Gunakan BOM (\uFEFF) agar Microsoft Excel membaca format UTF-8 dengan tepat tanpa error encoding
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    const fileName = selectedDate 
        ? `Rekap_Perpus_SMKN6_${selectedDate}.csv` 
        : `Rekap_Perpus_SMKN6_Semua_${today}.csv`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('📥 Rekap kunjungan berhasil didownload!');
}

// ============================================================================
// 8. INTEGRASI GOOGLE SHEETS DATABASE
// ============================================================================

function updateDbStatusUI() {
    const indicator = document.getElementById('dbStatusIndicator');
    const title = document.getElementById('dbStatusTitle');
    const desc = document.getElementById('dbStatusDesc');

    if (!indicator) return;

    if (GOOGLE_SCRIPT_URL) {
        indicator.className = 'status-indicator connected';
        title.innerHTML = 'Mode Database: <strong>Google Sheets (Cloud)</strong>';
        desc.innerText = 'Data kunjungan tersinkron secara online ke Google Spreadsheet.';
    } else {
        indicator.className = 'status-indicator local';
        title.innerHTML = 'Mode Database: <strong>Local Storage (Browser)</strong>';
        desc.innerText = 'Tersimpan lokal di browser ini. Klik "Set Google Sheets" untuk menghubungkan spreadsheet.';
    }
}

function openDbModal() {
    if (!isAdmin()) {
        alert('Akses terbatas! Pengaturan database hanya dapat dibuka oleh Admin Perpustakaan.');
        openAdminModal();
        return;
    }
    const modal = document.getElementById('modalDb');
    const input = document.getElementById('sheetsWebappUrl');
    if (modal) {
        modal.classList.remove('hidden');
        input.value = GOOGLE_SCRIPT_URL;
    }
}

function closeDbModal() {
    const modal = document.getElementById('modalDb');
    if (modal) modal.classList.add('hidden');
}

function saveDbConfig() {
    const url = document.getElementById('sheetsWebappUrl').value.trim();
    if (url && !url.includes('script.google.com')) {
        alert('URL tidak valid. Pastikan URL berasal dari hasil Deploy Google Apps Script (berisi script.google.com).');
        return;
    }

    GOOGLE_SCRIPT_URL = url;
    if (url) {
        localStorage.setItem('lib_sheets_url', url);
        showToast('🔗 Berhasil menyimpan URL Google Sheets!');
        syncDataFromCloud();
    } else {
        localStorage.removeItem('lib_sheets_url');
        showToast('ℹ️ Mode LocalStorage diaktifkan.');
    }
    
    closeDbModal();
    updateDbStatusUI();
}

function disconnectDb() {
    GOOGLE_SCRIPT_URL = '';
    localStorage.removeItem('lib_sheets_url');
    closeDbModal();
    updateDbStatusUI();
    showToast('ℹ️ Berpindah ke penyimpanan LocalStorage.');
}

async function sendVisitToGoogleSheets(visit) {
    if (!GOOGLE_SCRIPT_URL) return;

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'add', ...visit })
        });
        console.log('Tersimpan di Google Sheets');
    } catch (err) {
        console.warn('Gagal mengirim ke Google Sheets di background:', err);
    }
}

async function syncDataFromCloud() {
    if (!GOOGLE_SCRIPT_URL) {
        alert('URL Google Sheets belum disetting. Silakan klik "Set Google Sheets" terlebih dahulu.');
        openDbModal();
        return;
    }

    const indicator = document.getElementById('dbStatusIndicator');
    const btnSync = document.getElementById('btnSyncCloud');

    if (indicator) indicator.className = 'status-indicator syncing';
    if (btnSync) {
        btnSync.disabled = true;
        btnSync.innerText = '⏳ Sinkron...';
    }

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const result = await response.json();

        if (result && result.status === 'success' && Array.isArray(result.data)) {
            // Update data lokal dengan data terbaru dari Google Sheets
            saveLocalVisits(result.data);
            loadDashboardData();
            showToast(`✅ Sinkronisasi sukses! (${result.data.length} data dimuat)`);
        } else {
            showToast('⚠️ Tanggapan dari Google Sheets tidak sesuai format.');
        }
    } catch (error) {
        console.error('Error sync Google Sheets:', error);
        showToast('❌ Gagal menyinkronkan dengan Google Sheets. Periksa URL atau koneksi internet.');
    } finally {
        if (indicator) indicator.className = 'status-indicator connected';
        if (btnSync) {
            btnSync.disabled = false;
            btnSync.innerText = '🔄 Sinkron';
        }
    }
}

// ============================================================================
// 9. HELPER TOAST NOTIFIKASI & SANITASI
// ============================================================================

let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    clearTimeout(toastTimeout);
    toast.innerText = message;
    toast.classList.remove('hidden');

    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3200);
}

function escapeHtml(string) {
    if (string === null || string === undefined) return '';
    return String(string)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Inisialisasi awal saat halaman dibuka
document.addEventListener('DOMContentLoaded', () => {
    updateAdminUI();
    updateDbStatusUI();
    
    // Jika sudah ada URL Google Sheets, sinkronkan otomatis saat awal buka
    if (GOOGLE_SCRIPT_URL) {
        syncDataFromCloud().catch(() => {});
    }
});
