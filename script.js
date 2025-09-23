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

function normalizeText(value) {
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

function normalizeStatus(value) {
  return normalizeText(value);
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

function createRatingElement(ratingValue) {
  if (ratingValue === undefined || ratingValue === null) {
    return null;
  }

  const numericRating = Number.parseFloat(ratingValue);
  if (!Number.isFinite(numericRating)) {
    return null;
  }

  const normalizedRating = Math.max(
    0,
    Math.min(5, Math.round(numericRating))
  );

  if (normalizedRating === 0) {
    return null;
  }

  const ratingElement = document.createElement("div");
  ratingElement.className = "book-rating";
  ratingElement.setAttribute("role", "img");
  ratingElement.setAttribute(
    "aria-label",
    `Ocena: ${normalizedRating} na 5`
  );

  for (let i = 1; i <= 5; i += 1) {
    const star = document.createElement("span");
    star.className = "rating-star";
    star.textContent = i <= normalizedRating ? "★" : "☆";
    star.setAttribute("aria-hidden", "true");
    if (i <= normalizedRating) {
      star.classList.add("is-filled");
    }
    ratingElement.appendChild(star);
  }

  return ratingElement;
}

function getCellValue(row, index) {
  if (!row || index === undefined || index === null || index < 0) {
    return "";
  }
  const value = row[index];
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === undefined || value === null) {
    return "";
  }
  return value.toString().trim();
}

function createBookCard({ title, author, genre, rating, coverUrl }) {
  const item = document.createElement("li");
  item.className = "book-card";

  const bodyElement = document.createElement("div");
  bodyElement.className = "book-card-body";

  if (coverUrl) {
    const coverWrapper = document.createElement("div");
    coverWrapper.className = "book-cover";

    const coverImage = document.createElement("img");
    coverImage.src = coverUrl;
    coverImage.alt = title ? `Okładka: ${title}` : "Okładka książki";
    coverImage.loading = "lazy";

    coverWrapper.appendChild(coverImage);
    bodyElement.appendChild(coverWrapper);
  }

  const contentElement = document.createElement("div");
  contentElement.className = "book-card-content";

  const titleElement = document.createElement("h3");
  titleElement.className = "book-title";
  titleElement.textContent = title || "(bez tytułu)";
  contentElement.appendChild(titleElement);

  const metaElement = document.createElement("p");
  metaElement.className = "book-meta";

  if (author) {
    const authorSpan = document.createElement("span");
    authorSpan.className = "book-meta-author";
    authorSpan.textContent = author;
    metaElement.appendChild(authorSpan);
  }

  if (genre) {
    const genreSpan = document.createElement("span");
    genreSpan.className = "book-meta-genre";
    genreSpan.textContent = genre;
    metaElement.appendChild(genreSpan);
  }

  if (metaElement.childElementCount > 0) {
    contentElement.appendChild(metaElement);
  }

  const ratingElement = createRatingElement(rating);
  if (ratingElement) {
    contentElement.appendChild(ratingElement);
  }

  bodyElement.appendChild(contentElement);
  item.appendChild(bodyElement);

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
    const headerRow = rows[0] || [];
    const dataRows = rows.slice(1);

    const columnIndexes = {
      title: 2,
      author: 3,
      genre: 4,
      status: 5,
      coverUrl: 9, // kolumna J w arkuszu (0-index = 9)
      polishLink: 10,
      englishLink: 11,
      rating: -1,
    };

    let itemsLoaded = 0;

    dataRows.forEach((row) => {
      const title = getCellValue(row, columnIndexes.title);
      const author = getCellValue(row, columnIndexes.author);
      const genre = getCellValue(row, columnIndexes.genre);
      const status = getCellValue(row, columnIndexes.status);
      const coverUrl = getCellValue(row, columnIndexes.coverUrl);
      const rating = getCellValue(row, columnIndexes.rating);

      const bucket = bucketForStatus(status);
      if (!bucket || !lists[bucket]) {
        return;
      }

      const card = createBookCard({
        title,
        author,
        genre,
        rating,
        coverUrl,
      });
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
