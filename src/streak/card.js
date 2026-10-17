// @ts-check

// Port of github-readme-streak-stats card.php to JavaScript.

import { createRequire } from "module";

const require = createRequire(import.meta.url);
/** @type {Record<string, Record<string, string>>} */
const THEMES = require("./themes.json");
/** @type {string[]} */
const CSS_COLORS = require("./colors.json");
/** @type {Record<string, any>} */
const TRANSLATIONS = require("./translations.json");

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * @param {string} s Text.
 * @returns {string} HTML-escaped text.
 */
const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * Normalize a locale code (e.g. "zh-hans-cn" -> "zh_Hans_CN").
 *
 * @param {string} localeCode Locale code.
 * @returns {string} Normalized code.
 */
const normalizeLocaleCode = (localeCode) => {
  const m =
    /^([a-z]{2,3})(?:[_-]([a-z]{4}))?(?:[_-]([0-9]{3}|[a-z]{2}))?$/i.exec(
      localeCode,
    );
  if (!m) {
    return "en";
  }
  const language = m[1].toLowerCase();
  const script = m[2]
    ? m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()
    : "";
  const region = (m[3] || "").toUpperCase();
  return [language, script, region].filter(Boolean).join("_");
};

/**
 * @param {string} localeCode Locale code.
 * @returns {Record<string, any>} Translations for the locale, filled with English.
 */
const getTranslations = (localeCode) => {
  let code = normalizeLocaleCode(localeCode);
  if (!TRANSLATIONS[code]) {
    code = code.split("_")[0];
  }
  let locale = TRANSLATIONS[code] || {};
  if (typeof locale === "string") {
    locale = TRANSLATIONS[locale];
  }
  return { ...TRANSLATIONS.en, ...locale };
};

/**
 * Locale usable by Intl (falls back to English).
 *
 * @param {string} localeCode Locale code.
 * @returns {string} BCP47 locale.
 */
const intlLocale = (localeCode) => {
  const tag = normalizeLocaleCode(localeCode).replace(/_/g, "-");
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return "en";
  }
};

// ---------------------------------------------------------------------------
// Dates & numbers
// ---------------------------------------------------------------------------

/**
 * Format a date using a PHP `date()` format string (common subset).
 *
 * @param {Date} date Date (UTC fields are used).
 * @param {string} format PHP date format.
 * @returns {string} Formatted date.
 */
const phpDate = (date, format) => {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const w = date.getUTCDay();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  let out = "";
  for (let i = 0; i < format.length; i++) {
    const c = format[i];
    switch (c) {
      case "\\":
        out += format[++i] ?? "";
        break;
      case "d":
        out += pad(d);
        break;
      case "j":
        out += d;
        break;
      case "D":
        out += DAY_NAMES[w];
        break;
      case "l":
        out += LONG_DAY_NAMES[w];
        break;
      case "N":
        out += w === 0 ? 7 : w;
        break;
      case "w":
        out += w;
        break;
      case "S":
        out +=
          d % 10 === 1 && d !== 11
            ? "st"
            : d % 10 === 2 && d !== 12
              ? "nd"
              : d % 10 === 3 && d !== 13
                ? "rd"
                : "th";
        break;
      case "F":
        out += MONTH_NAMES[m];
        break;
      case "M":
        out += MONTH_NAMES[m].slice(0, 3);
        break;
      case "m":
        out += pad(m + 1);
        break;
      case "n":
        out += m + 1;
        break;
      case "t":
        out += new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        break;
      case "Y":
        out += y;
        break;
      case "y":
        out += pad(y % 100);
        break;
      default:
        out += c;
    }
  }
  return out;
};

/**
 * @param {string} dateString Y-m-d.
 * @param {string|null|undefined} format PHP date format or null for locale default.
 * @param {string} locale Locale code.
 * @returns {string} Formatted date.
 */
const formatDate = (dateString, format, locale) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  const currentYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  let formatted;
  if (currentYear) {
    formatted = format
      ? phpDate(date, format.replace(/\[.*?\]/g, ""))
      : new Intl.DateTimeFormat(intlLocale(locale), {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(date);
  } else {
    formatted = format
      ? phpDate(date, format.replace(/[[\]]/g, ""))
      : new Intl.DateTimeFormat(intlLocale(locale), {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(date);
  }
  return escapeHtml(formatted);
};

/**
 * @param {string[]} days Short English day names.
 * @param {string} locale Locale code.
 * @returns {string[]} Translated short day names.
 */
const translateDays = (days, locale) => {
  if (locale === "en") {
    return days;
  }
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  // 2023-01-01 was a Sunday
  return days.map((d) =>
    fmt.format(new Date(Date.UTC(2023, 0, 1 + DAY_NAMES.indexOf(d)))),
  );
};

/**
 * @param {number} num Number.
 * @param {string} localeCode Locale code.
 * @param {boolean} useShortNumbers Use K/M/B/T suffixes.
 * @returns {string} Formatted number.
 */
const formatNumber = (num, localeCode, useShortNumbers) => {
  let suffix = "";
  if (useShortNumbers) {
    const units = ["", "K", "M", "B", "T"];
    let i = 0;
    for (; num >= 1000 && i < units.length - 1; i++) {
      num /= 1000;
    }
    suffix = units[i];
    num = Math.round(num * 10) / 10;
  }
  return new Intl.NumberFormat(intlLocale(localeCode)).format(num) + suffix;
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} s Input.
 * @param {number} width Max width.
 * @param {boolean} cut Cut long words.
 * @returns {string} Wrapped text.
 */
const utf8WordWrap = (s, width, cut) => {
  s = s.replace(new RegExp(`(.{1,${width}})(?:\\s|$)`, "gu"), "$1\n");
  if (cut) {
    s = s.replace(new RegExp(`(\\S{${width}})(?=\\S)`, "gu"), "$1\n");
  }
  return s.replace(/\n+$/, "");
};

/**
 * @param {string} text Text.
 * @param {number} maxChars Max chars per line.
 * @param {number} line1Offset dy of the first line.
 * @returns {string} Text or tspans.
 */
const splitLines = (text, maxChars, line1Offset) => {
  if (maxChars > 0 && [...text].length > maxChars && !text.includes("\n")) {
    text = text.includes(" - ")
      ? text.replace(/ - /g, "\n- ")
      : utf8WordWrap(text, maxChars, true);
  }
  text = escapeHtml(text);
  return text.replace(
    /^(.*)\n(.*)/,
    `<tspan x='0' dy='${line1Offset}'>$1</tspan><tspan x='0' dy='16'>$2</tspan>`,
  );
};

/**
 * @param {string} v Parameter value.
 * @param {number} def Default.
 * @returns {number} Number.
 */
const toNumber = (v, def) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : def;
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * @param {Record<string, any>} params Request params.
 * @returns {Record<string, string>} Theme colors (+ backgroundGradient).
 */
const getRequestedTheme = (params) => {
  const selected = String(params.theme || "default")
    .toLowerCase()
    .replace(/_/g, "-");
  const theme = { ...(THEMES[selected] || THEMES.default) };

  for (const prop of Object.keys(theme)) {
    if (params[prop] === undefined) {
      continue;
    }
    const param = String(params[prop]).toLowerCase();
    if (/^([a-f0-9]{3}|[a-f0-9]{4}|[a-f0-9]{6}|[a-f0-9]{8})$/.test(param)) {
      theme[prop] = `#${param}`;
    } else if (CSS_COLORS.includes(param)) {
      theme[prop] = param;
    } else if (
      prop === "background" &&
      /^-?[0-9]+,[a-f0-9]{3,8}(,[a-f0-9]{3,8})+$/.test(param)
    ) {
      theme[prop] = param;
    }
  }

  if (params.hide_border === "true") {
    theme.border = "#0000";
  }

  let gradient = "";
  const parts = (theme.background || "").split(",");
  if (parts.length >= 3) {
    theme.background = "url(#gradient)";
    gradient = `<linearGradient id='gradient' gradientTransform='rotate(${parts[0]})' gradientUnits='userSpaceOnUse'>`;
    const colors = parts.slice(1);
    colors.forEach((c, i) => {
      gradient += `<stop offset='${(i * 100) / (colors.length - 1)}%' stop-color='#${c}' />`;
    });
    gradient += "</linearGradient>";
  }
  theme.backgroundGradient = gradient;
  return theme;
};

/**
 * @param {Record<string, any>} params Params.
 * @param {number} numColumns Columns.
 * @returns {number} Width.
 */
const getCardWidth = (params, numColumns = 3) =>
  Math.max(100 * numColumns, parseInt(params.card_width, 10) || 495);

/**
 * @param {Record<string, any>} params Params.
 * @returns {number} Height.
 */
const getCardHeight = (params) =>
  Math.max(170, parseInt(params.card_height, 10) || 195);

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const FONT = "font-family='\"Segoe UI\", Ubuntu, sans-serif'";

/**
 * @param {import("./stats.js").StreakStats} stats Stats.
 * @param {Record<string, any>} params Params.
 * @returns {string} SVG.
 */
const generateCard = (stats, params = {}) => {
  const theme = getRequestedTheme(params);
  const localeCode = String(params.locale || "en");
  const tr = getTranslations(localeCode);
  const direction = tr.rtl ? "rtl" : "ltr";
  const dateFormat = params.date_format || tr.date_format || null;
  const borderRadius = toNumber(params.border_radius, 4.5);

  const showTotal = params.hide_total_contributions !== "true";
  const showCurrent = params.hide_current_streak !== "true";
  const showLongest = params.hide_longest_streak !== "true";
  const numColumns = +showTotal + +showCurrent + +showLongest;

  const cardWidth = getCardWidth(params, numColumns);
  const rectWidth = cardWidth - 1;
  const columnWidth = numColumns > 0 ? cardWidth / numColumns : 0;
  const cardHeight = getCardHeight(params);
  const rectHeight = cardHeight - 1;
  const heightOffset = (cardHeight - 195) / 2;

  const barOffsets = [-999, -999];
  for (let i = 0; i < numColumns - 1; i++) {
    barOffsets[i] = columnWidth * (i + 1);
  }
  let columnOffsets = [];
  for (let i = 0; i < numColumns; i++) {
    columnOffsets.push(columnWidth / 2 + columnWidth * i);
  }
  if (direction === "rtl") {
    columnOffsets = columnOffsets.reverse();
  }
  let next = 0;
  const totalOffset = showTotal ? columnOffsets[next++] : -999;
  const currentOffset = showCurrent ? columnOffsets[next++] : -999;
  const longestOffset = showLongest ? columnOffsets[next++] : -999;

  const barH = [28 + heightOffset / 2, 170 + heightOffset];
  const sideH = [48 + heightOffset, 84 + heightOffset, 114 + heightOffset];
  const curH = [
    48 + heightOffset,
    108 + heightOffset,
    145 + heightOffset,
    71 + heightOffset,
    19.5 + heightOffset,
  ];

  const short = params.short_numbers === "true";
  const total = formatNumber(stats.totalContributions, localeCode, short);
  const first = formatDate(stats.firstContribution, dateFormat, localeCode);
  let totalRange = `${first} - ${tr.Present}`;

  const range = (/** @type {import("./stats.js").Streak} */ s) => {
    const a = formatDate(s.start, dateFormat, localeCode);
    const b = formatDate(s.end, dateFormat, localeCode);
    return a === b ? a : `${a} - ${b}`;
  };
  const current = formatNumber(stats.currentStreak.length, localeCode, short);
  let currentRange = range(stats.currentStreak);
  const longest = formatNumber(stats.longestStreak.length, localeCode, short);
  let longestRange = range(stats.longestStreak);

  const maxLabel =
    numColumns > 0 ? Math.floor(cardWidth / numColumns / 7.5) : 0;
  const totalText = splitLines(tr["Total Contributions"], maxLabel, -9);
  const weekly = stats.mode === "weekly";
  const currentText = splitLines(
    tr[weekly ? "Week Streak" : "Current Streak"],
    maxLabel,
    -9,
  );
  const longestText = splitLines(
    tr[weekly ? "Longest Week Streak" : "Longest Streak"],
    maxLabel,
    -9,
  );

  const maxDates = numColumns > 0 ? Math.floor(cardWidth / numColumns / 6) : 0;
  totalRange = splitLines(totalRange, maxDates, 0);
  currentRange = splitLines(currentRange, maxDates, 0);
  longestRange = splitLines(longestRange, maxDates, 0);

  let excludedDays = "";
  if (stats.excludedDays && stats.excludedDays.length > 0) {
    const offset = direction === "rtl" ? cardWidth - 5 : 5;
    const separator = tr.comma_separator ?? ", ";
    const days = translateDays(stats.excludedDays, localeCode).join(separator);
    const text = escapeHtml(tr["Excluding {days}"].replace("{days}", days));
    excludedDays = `<g style='isolation: isolate'>
                <!-- Excluded Days -->
                <g transform='translate(${offset},187)'>
                    <text stroke-width='0' text-anchor='right' fill='${theme.excludeDaysLabel}' stroke='none' ${FONT} font-weight='400' font-size='10px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>
                        * ${text}
                    </text>
                </g>
            </g>`;
  }

  const bar = (/** @type {number} */ x) =>
    `<line x1='${x}' y1='${barH[0]}' x2='${x}' y2='${barH[1]}' vector-effect='non-scaling-stroke' stroke-width='1' stroke='${theme.stroke}' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>`;

  return `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'
                style='isolation: isolate' viewBox='0 0 ${cardWidth} ${cardHeight}' width='${cardWidth}px' height='${cardHeight}px' direction='${direction}'>
        <style>
            @keyframes currstreak {
                0% { font-size: 3px; opacity: 0.2; }
                80% { font-size: 34px; opacity: 1; }
                100% { font-size: 28px; opacity: 1; }
            }
            @keyframes fadein {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }
        </style>
        <defs>
            <clipPath id='outer_rectangle'>
                <rect width='${cardWidth}' height='${cardHeight}' rx='${borderRadius}'/>
            </clipPath>
            <mask id='mask_out_ring_behind_fire'>
                <rect width='${cardWidth}' height='${cardHeight}' fill='white'/>
                <ellipse id='mask-ellipse' cx='${currentOffset}' cy='32' rx='13' ry='18' fill='black'/>
            </mask>
            ${theme.backgroundGradient}
        </defs>
        <g clip-path='url(#outer_rectangle)'>
            <g style='isolation: isolate'>
                <rect stroke='${theme.border}' fill='${theme.background}' rx='${borderRadius}' x='0.5' y='0.5' width='${rectWidth}' height='${rectHeight}'/>
            </g>
            <g style='isolation: isolate'>
                ${bar(barOffsets[0])}
                ${bar(barOffsets[1])}
            </g>
            <g style='isolation: isolate'>
                <!-- Total Contributions big number -->
                <g transform='translate(${totalOffset}, ${sideH[0]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.sideNums}' stroke='none' ${FONT} font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.6s'>
                        ${total}
                    </text>
                </g>

                <!-- Total Contributions label -->
                <g transform='translate(${totalOffset}, ${sideH[1]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.sideLabels}' stroke='none' ${FONT} font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.7s'>
                        ${totalText}
                    </text>
                </g>

                <!-- Total Contributions range -->
                <g transform='translate(${totalOffset}, ${sideH[2]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.dates}' stroke='none' ${FONT} font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.8s'>
                        ${totalRange}
                    </text>
                </g>
            </g>
            <g style='isolation: isolate'>
                <!-- Current Streak label -->
                <g transform='translate(${currentOffset}, ${curH[1]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.currStreakLabel}' stroke='none' ${FONT} font-weight='700' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>
                        ${currentText}
                    </text>
                </g>

                <!-- Current Streak range -->
                <g transform='translate(${currentOffset}, ${curH[2]})'>
                    <text x='0' y='21' stroke-width='0' text-anchor='middle' fill='${theme.dates}' stroke='none' ${FONT} font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>
                        ${currentRange}
                    </text>
                </g>

                <!-- Ring around number -->
                <g mask='url(#mask_out_ring_behind_fire)'>
                    <circle cx='${currentOffset}' cy='${curH[3]}' r='40' fill='none' stroke='${theme.ring}' stroke-width='5' style='opacity: 0; animation: fadein 0.5s linear forwards 0.4s'></circle>
                </g>
                <!-- Fire icon -->
                <g transform='translate(${currentOffset}, ${curH[4]})' stroke-opacity='0' style='opacity: 0; animation: fadein 0.5s linear forwards 0.6s'>
                    <path d='M -12 -0.5 L 15 -0.5 L 15 23.5 L -12 23.5 L -12 -0.5 Z' fill='none'/>
                    <path d='M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z' fill='${theme.fire}' stroke-opacity='0'/>
                </g>

                <!-- Current Streak big number -->
                <g transform='translate(${currentOffset}, ${curH[0]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.currStreakNum}' stroke='none' ${FONT} font-weight='700' font-size='28px' font-style='normal' style='animation: currstreak 0.6s linear forwards'>
                        ${current}
                    </text>
                </g>

            </g>
            <g style='isolation: isolate'>
                <!-- Longest Streak big number -->
                <g transform='translate(${longestOffset}, ${sideH[0]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.sideNums}' stroke='none' ${FONT} font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.2s'>
                        ${longest}
                    </text>
                </g>

                <!-- Longest Streak label -->
                <g transform='translate(${longestOffset}, ${sideH[1]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.sideLabels}' stroke='none' ${FONT} font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.3s'>
                        ${longestText}
                    </text>
                </g>

                <!-- Longest Streak range -->
                <g transform='translate(${longestOffset}, ${sideH[2]})'>
                    <text x='0' y='32' stroke-width='0' text-anchor='middle' fill='${theme.dates}' stroke='none' ${FONT} font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 1.4s'>
                        ${longestRange}
                    </text>
                </g>
            </g>
            ${excludedDays}
        </g>
    </svg>
`;
};

/**
 * @param {string} message Error message.
 * @param {Record<string, any>} params Params.
 * @returns {string} SVG.
 */
const generateErrorCard = (message, params = {}) => {
  const theme = getRequestedTheme(params);
  const borderRadius = toNumber(params.border_radius, 4.5);
  const cardWidth = getCardWidth(params);
  const rectWidth = cardWidth - 1;
  const centerOffset = cardWidth / 2;
  const cardHeight = getCardHeight(params);
  const rectHeight = cardHeight - 1;
  const heightOffset = (cardHeight - 195) / 2;
  const errorLabelOffset = cardHeight / 2 + 10.5;

  return `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' style='isolation: isolate' viewBox='0 0 ${cardWidth} ${cardHeight}' width='${cardWidth}px' height='${cardHeight}px'>
        <style>
            a {
                fill: ${theme.dates};
            }
        </style>
        <defs>
            <clipPath id='outer_rectangle'>
                <rect width='${cardWidth}' height='${cardHeight}' rx='${borderRadius}'/>
            </clipPath>
            ${theme.backgroundGradient}
        </defs>
        <g clip-path='url(#outer_rectangle)'>
            <g style='isolation: isolate'>
                <rect stroke='${theme.border}' fill='${theme.background}' rx='${borderRadius}' x='0.5' y='0.5' width='${rectWidth}' height='${rectHeight}'/>
            </g>
            <g style='isolation: isolate'>
                <!-- Error label -->
                <g transform='translate(${centerOffset}, ${errorLabelOffset})'>
                    <text x='0' y='50' dy='0.25em' stroke-width='0' text-anchor='middle' fill='${theme.sideLabels}' stroke='none' ${FONT} font-weight='400' font-size='14px' font-style='normal'>
                        ${escapeHtml(message)}
                    </text>
                </g>

                <!-- Mask for background behind face -->
                <defs>
                    <mask id='cut-off-area'>
                        <rect x='0' y='0' width='500' height='500' fill='white' />
                        <ellipse cx='${centerOffset}' cy='31' rx='13' ry='18'/>
                    </mask>
                </defs>
                <!-- Sad face -->
                <g transform='translate(${centerOffset}, ${heightOffset})'>
                    <path fill='${theme.fire}' d='M0,35.8c-25.2,0-45.7,20.5-45.7,45.7s20.5,45.8,45.7,45.8s45.7-20.5,45.7-45.7S25.2,35.8,0,35.8z M0,122.3c-11.2,0-21.4-4.5-28.8-11.9c-2.9-2.9-5.4-6.3-7.4-10c-3-5.7-4.6-12.1-4.6-18.9c0-22.5,18.3-40.8,40.8-40.8 c10.7,0,20.4,4.1,27.7,10.9c3.8,3.5,6.9,7.7,9.1,12.4c2.6,5.3,4,11.3,4,17.6C40.8,104.1,22.5,122.3,0,122.3z'/>
                    <path fill='${theme.fire}' d='M4.8,93.8c5.4,1.1,10.3,4.2,13.7,8.6l3.9-3c-4.1-5.3-10-9-16.6-10.4c-10.6-2.2-21.7,1.9-28.3,10.4l3.9,3 C-13.1,95.3-3.9,91.9,4.8,93.8z'/>
                    <circle fill='${theme.fire}' cx='-15' cy='71' r='4.9'/>
                    <circle fill='${theme.fire}' cx='15' cy='71' r='4.9'/>
                </g>
            </g>
        </g>
    </svg>
`;
};

/**
 * @param {string} svg SVG.
 * @returns {string} SVG without animations.
 */
const removeAnimations = (svg) =>
  svg
    .replace(/(<style>[\s\S]*?<\/style>)/gm, "")
    .replace(/opacity: 0;/gm, "opacity: 1;")
    .replace(/animation: fadein[^;'"]+/gm, "opacity: 1;")
    .replace(/animation: currstreak[^;'"]+/gm, "font-size: 28px;")
    .replace(/<a [\s\S]*?>([\s\S]*?)<\/a>/gm, "$1");

/**
 * Convert 3/4/6/8 digit hex to 6 digit hex and opacity.
 *
 * @param {string} color Hex digits without "#".
 * @returns {{ color: string, opacity: number }} Converted color.
 */
const convertHexColor = (color) => {
  color = color.replace(/[^0-9a-fA-F]/g, "");
  if (color.length === 3 || color.length === 4) {
    color = [...color].map((c) => c + c).join("");
  }
  if (color.length === 6) {
    return { color: `#${color}`, opacity: 1 };
  }
  if (color.length === 8) {
    return {
      color: `#${color.slice(0, 6)}`,
      opacity: parseInt(color.slice(6, 8), 16) / 255,
    };
  }
  throw new Error(`Invalid color: ${color}`);
};

/**
 * Convert transparent hex colors to 6 digit hex + opacity attribute.
 *
 * @param {string} svg SVG.
 * @returns {string} SVG.
 */
const convertHexColors = (svg) =>
  svg
    .replace(/(fill|stroke)=['"]transparent['"]/gm, '$1="#0000"')
    .replace(
      /(fill|stroke|stop-color)=['"]#([0-9a-fA-F]{4}|[0-9a-fA-F]{8})['"]/gm,
      (_m, attr, hex) => {
        const opacityAttr =
          attr === "stop-color" ? "stop-opacity" : `${attr}-opacity`;
        const r = convertHexColor(hex);
        return `${attr}='${r.color}' ${opacityAttr}='${r.opacity}'`;
      },
    );

/**
 * Render stats or an error message according to the requested type.
 *
 * @param {string | import("./stats.js").StreakStats} output Stats or error message.
 * @param {Record<string, any>} params Params.
 * @param {number} errorCode Error code (for JSON responses).
 * @returns {{ contentType: string, body: string }} Response.
 */
const generateOutput = (output, params = {}, errorCode = 200) => {
  if (params.type === "json") {
    return {
      contentType: "application/json",
      body: JSON.stringify(
        typeof output === "string"
          ? { error: output, code: errorCode }
          : output,
      ),
    };
  }
  let svg =
    typeof output === "string"
      ? generateErrorCard(output, params)
      : generateCard(output, params);
  svg = convertHexColors(svg);
  if (params.disable_animations === "true") {
    svg = removeAnimations(svg);
  }
  return { contentType: "image/svg+xml", body: svg };
};

export {
  generateCard,
  generateErrorCard,
  generateOutput,
  getRequestedTheme,
  normalizeLocaleCode,
  getTranslations,
  formatNumber,
  formatDate,
  removeAnimations,
  convertHexColors,
  phpDate,
};
