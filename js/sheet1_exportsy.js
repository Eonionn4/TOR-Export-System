// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCkZ2VleUNUdRqHQ6x51RLL5S49ybY2hNY",
  authDomain: "tor-export-system.firebaseapp.com",
  projectId: "tor-export-system",
  storageBucket: "tor-export-system.firebasestorage.app",
  messagingSenderId: "452933092366",
  appId: "1:452933092366:web:70deef29cfb35cf70c685f",
  measurementId: "G-JL2CGXFNC1"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
let latestDisplayData = [];

window.onload = async function () {
  const selectedDoc = localStorage.getItem("jmp_selected_doc");
  if (selectedDoc) {
    const doc = await db.collection("jmp_table_saves").doc(selectedDoc).get();
    if (doc.exists) {
      const data = doc.data();
      latestDisplayData = data.data;
      displayTable(latestDisplayData);
      localStorage.removeItem("jmp_selected_doc"); // clear after loading
    }
  }
};

function importAndSave() {
  const fileInput = document.getElementById("excelFile");
  if (!fileInput.files.length) return alert("Please select an Excel file.");

  const file = fileInput.files[0];
  const reader = new FileReader();

  reader.onload = async function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    if (rawData.length === 0) {
      alert("No data found in Excel.");
      return;
    }

    const cleanedData = rawData.map(row => {
      const trimmedRow = {};
      Object.keys(row).forEach(k => {
        trimmedRow[k.trim()] = row[k];
      });
      return trimmedRow;
    });

    const merged = {};
    const allModels = new Set();
    const allWeeks = new Set();

    cleanedData.forEach(row => {
      const model = row.Model || "UNKNOWN";
      const qty = parseInt(row.Quantity || row["   Quantity"] || 0) || 0;
      const dateStr = row.Date || row["Ship Date"] || row["Delivery Date"];
      const date = new Date(dateStr);
      const ww = getWorkWeekRange(date);
      const key = `${model}__${ww}`;
      allModels.add(model);
      allWeeks.add(ww);

      if (!merged[key]) {
        merged[key] = { Model: model, WorkWeek: ww, Quantity: qty };
      } else {
        merged[key].Quantity += qty;
      }
    });

    const finalData = [];
    allModels.forEach(model => {
      allWeeks.forEach(ww => {
        const key = `${model}__${ww}`;
        if (merged[key]) {
          finalData.push(merged[key]);
        } else {
          finalData.push({ Model: model, WorkWeek: ww, Quantity: 0 });
        }
      });
    });

    finalData.sort((a, b) => {
      const d1 = new Date(a.WorkWeek.split("~")[0]);
      const d2 = new Date(b.WorkWeek.split("~")[0]);
      return d1 - d2 || a.Model.localeCompare(b.Model);
    });

    latestDisplayData = finalData;
    displayTable(finalData);
  };

  reader.readAsArrayBuffer(file);
}

function displayTable(data) {
  const container = document.getElementById("tableContainer");
  container.innerHTML = "";

  const table = document.createElement("table");
  table.id = "exportTable";

  const headers = ["Model", "Quantity", "WorkWeek"];
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach(h => {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  const grouped = {};
  data.forEach(row => {
    if (!grouped[row.Model]) grouped[row.Model] = [];
    grouped[row.Model].push(row);
  });

  Object.entries(grouped).forEach(([model, rows]) => {
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");

      if (index === 0) {
        const tdModel = document.createElement("td");
        tdModel.textContent = model;
        tdModel.rowSpan = rows.length;
        tr.appendChild(tdModel);
      }

      const tdQty = document.createElement("td");
      tdQty.textContent = row.Quantity;
      tr.appendChild(tdQty);

      const tdWW = document.createElement("td");
      tdWW.textContent = row.WorkWeek;
      tr.appendChild(tdWW);

      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function getWorkWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const thisThursday = new Date(d);
  thisThursday.setDate(d.getDate() - ((day + 4) % 7));
  const start = new Date(thisThursday);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)}~${fmt(end)}`;
}

function filterTable() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const filtered = latestDisplayData.filter(row =>
    row.Model.toLowerCase().includes(keyword) || row.WorkWeek.toLowerCase().includes(keyword)
  );
  displayTable(filtered);
}

function exportToExcel() {
  const table = document.getElementById("exportTable");
  if (!table) return alert("No table found.");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.table_to_sheet(table);
  XLSX.utils.book_append_sheet(wb, ws, "Export");
  XLSX.writeFile(wb, "Exported_Model_WorkWeek.xlsx");
}

function saveMergedTable() {
  if (!latestDisplayData.length) return alert("No data to save.");
  const now = new Date();
  const importDate = now.toISOString();

  const docRef = db.collection("jmp_table_saves").doc();
  docRef.set({
    importDate: importDate,
    data: latestDisplayData
  })
    .then(() => alert("✅ Table saved successfully!"))
    .catch(err => {
      console.error("❌ Error saving table:", err);
      alert("Error saving table.");
    });
}
