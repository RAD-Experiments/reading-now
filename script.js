const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQjjjgtBTUiSTuLiJQ_rP4m7uYffLK_uvkF2Dt1_NildFjEHUcilVUysEQRBH-iWJC1dA-Rtpx8tVn8/pub?gid=2028690260&single=true&output=csv";

const lists = {
  reading: document.getElementById("reading-list"),
  next: document.getElementById("next-list"),
  finished: document.getElementById("finished-list"),
};

const emptyMessages = {
  reading: document.querySelector('[data-for="reading-list"]'),
  next: document.querySelector('[data-for="next-list"]'),
  finished: document.querySelector('[data-for="finished-list"]'),
};

const statusElement = document.getElementById("status-message");

function setStatusMessage(text, type = "info") {
  if (!statusElement) {
    return;
  }
  if (!text) {
    statusElement.hidden = true;
    return;
  }
  statusElement.hidden = false;
  statusElement.textContent = text;
  statusElement.classList.toggle("is-error", type === "error");
}

function parseCSV(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\"") {
      const nextChar = text[i + 1];
      if (insideQuotes && nextChar === "\"") {
        current += "\"";
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && text[i + 1] === "\n") {
        // Skip the next \n in Windows-style line endings
        i += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function normalizeStatus(value) {
  if (!value) {
    return "";
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function bucketForStatus(status) {
  const normalized = normalizeStatus(status);
  if (!normalized) {
    return null;
  }
  if (normalized.includes("czytam")) {
    return "reading";
  }
  if (normalized.includes("planuje")) {
    return "next";
  }
  if (normalized.includes("przeczyt")) {
    return "finished";
  }
  return null;
}

function createBookCard({ title, author, genre }) {
  const item = document.createElement("li");
  item.className = "book-card";

  const titleElement = document.createElement("h3");
  titleElement.className = "book-title";
  titleElement.textContent = title || "(bez tytułu)";
  item.appendChild(titleElement);

  const metaElement = document.createElement("p");
  metaElement.className = "book-meta";

  if (author) {
    const authorSpan = document.createElement("span");
    authorSpan.textContent = author;
    metaElement.appendChild(authorSpan);
  }

  if (genre) {
    const genreSpan = document.createElement("span");
    genreSpan.textContent = genre;
    metaElement.appendChild(genreSpan);
  }

  if (metaElement.childElementCount > 0) {
    item.appendChild(metaElement);
  }

  return item;
}

function toggleEmptyMessage(listKey) {
  const list = lists[listKey];
  const message = emptyMessages[listKey];
  if (!list || !message) {
    return;
  }
  if (list.children.length === 0) {
    message.hidden = false;
  } else {
    message.hidden = true;
  }
}

async function loadBooks() {
  try {
    setStatusMessage("Ładuję dane z arkusza...");
    const response = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Nie udało się pobrać danych (status ${response.status}).`);
    }
    const csvText = await response.text();
    const rows = parseCSV(csvText).filter((row) =>
      row.some((cell) => cell && cell.trim() !== "")
    );

    if (rows.length === 0) {
      throw new Error("Arkusz nie zawiera żadnych danych.");
    }

    // Zakładamy, że pierwszy wiersz to nagłówki.
    const dataRows = rows.slice(1);
    let itemsLoaded = 0;

    dataRows.forEach((row) => {
      const title = row[2] ? row[2].trim() : "";
      const author = row[3] ? row[3].trim() : "";
      const genre = row[4] ? row[4].trim() : "";
      const status = row[5] ? row[5].trim() : "";

      const bucket = bucketForStatus(status);
      if (!bucket || !lists[bucket]) {
        return;
      }

      const card = createBookCard({ title, author, genre });
      lists[bucket].appendChild(card);
      itemsLoaded += 1;
    });

    ["reading", "next", "finished"].forEach((key) => toggleEmptyMessage(key));

    const message =
      itemsLoaded > 0
        ? `Zaktualizowano: ${new Date().toLocaleString("pl-PL")}.`
        : "Brak danych do wyświetlenia.";
    setStatusMessage(message);
  } catch (error) {
    console.error(error);
    setStatusMessage(
      "Nie udało się pobrać danych z arkusza. Spróbuj odświeżyć stronę później.",
      "error"
    );
    ["reading", "next", "finished"].forEach((key) => toggleEmptyMessage(key));
  }
}

loadBooks();
