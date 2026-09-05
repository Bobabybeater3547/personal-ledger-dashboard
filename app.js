(() => {
  "use strict";

  const rawFragment = window.__LEDGER_FRAGMENT__ || "";
  delete window.__LEDGER_FRAGMENT__;

  const state = {
    period: "thisMonth",
    transactions: [],
    accounts: [],
    skippedLines: 0,
    activeCategory: null,
    page: 1,
    transactionFilter: null,
    rhythmYear: null,
    customYear: new Date().getFullYear(),
    customMonth: new Date().getMonth(),
    accountsDocument: null,
    accountsFilename: "accounts.txt",
    savedAccounts: null,
    accountsDirty: false,
    editingAccount: null,
  };

  const PAGE_SIZE = 10;

  const PERIOD_LABELS = {
    thisMonth: "This month",
    lastMonth: "Last month",
    twoMonthsAgo: "2 months ago",
    thisYear: "This year",
    lastYear: "Last year",
    allTime: "All time",
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizedType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isType(transaction, type) {
    return normalizedType(transaction.type) === type;
  }

  function decodeBase64Utf8(value) {
    let normalized = String(value || "").trim().replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  function decodeFragmentValue(value) {
    if (!value) return "";
    try {
      return decodeBase64Utf8(value);
    } catch (_) {
      try {
        return decodeURIComponent(value);
      } catch (_) {
        return value;
      }
    }
  }

  function readFragment(fragment) {
    if (!fragment) return { ledgerText: "", accountsText: "" };

    const params = new URLSearchParams(fragment);
    if (params.has("ledger") || params.has("accounts")) {
      return {
        ledgerText: decodeFragmentValue(params.get("ledger")),
        accountsText: decodeFragmentValue(params.get("accounts")),
      };
    }

    try {
      const payload = JSON.parse(decodeFragmentValue(fragment));
      return {
        ledgerText: typeof payload.ledger === "string" ? payload.ledger : "",
        accountsText: typeof payload.accounts === "string" ? payload.accounts : JSON.stringify(payload.accounts || {}),
      };
    } catch (_) {
      return { ledgerText: "", accountsText: "" };
    }
  }

  function parseLedger(text) {
    let skipped = 0;
    const transactions = String(text || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, ledgerIndex) => {
        try {
          const transaction = JSON.parse(line);
          const date = new Date(transaction.date);
          if (!transaction || typeof transaction !== "object" || Number.isNaN(date.getTime())) {
            skipped += 1;
            return null;
          }
          return {
            ...transaction,
            amount: finiteNumber(transaction.amount),
            fxRate: finiteNumber(transaction.fxRate),
            jpyAmount: hasNumber(transaction.jpyAmount) ? Number(transaction.jpyAmount) : NaN,
            dateObject: date,
            ledgerIndex,
          };
        } catch (_) {
          skipped += 1;
          return null;
        }
      })
      .filter(Boolean)
      // Later lines were appended later: show those first when dates are equal.
      .sort((a, b) => b.dateObject - a.dateObject || b.ledgerIndex - a.ledgerIndex);

    return { transactions, skipped };
  }

  function parseAccounts(text) {
    if (!text) return [];
    try {
      const parsed = JSON.parse(String(text).replace(/^\uFEFF/, ""));
      const accounts = Array.isArray(parsed) ? parsed : parsed.accounts;
      if (!Array.isArray(accounts)) return [];
      return accounts
        .filter((account) => account && typeof account.name === "string" && account.name.trim())
        .map((account) => ({
          ...account,
          name: account.name.trim(),
          type: String(account.type || "Account").trim(),
          currency: String(account.currency || "JPY").trim().toUpperCase(),
          openingBalance: finiteNumber(account.openingBalance),
          openingBalanceKnown: hasNumber(account.openingBalance),
        }));
    } catch (_) {
      return [];
    }
  }

  function hasNumber(value) {
    return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
  }

  function categoryName(transaction) {
    return String(transaction.category || "Other").trim() || "Other";
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addMonths(date, count) {
    return new Date(date.getFullYear(), date.getMonth() + count, 1);
  }

  function periodRange(period) {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const year = now.getFullYear();

    switch (period) {
      case "customMonth":
        return { start: new Date(state.customYear, state.customMonth, 1), end: new Date(state.customYear, state.customMonth + 1, 1) };
      case "customYear":
        return { start: new Date(state.customYear, 0, 1), end: new Date(state.customYear + 1, 0, 1) };
      case "lastMonth":
        return { start: addMonths(monthStart, -1), end: monthStart };
      case "twoMonthsAgo":
        return { start: addMonths(monthStart, -2), end: addMonths(monthStart, -1) };
      case "thisYear":
        return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
      case "lastYear":
        return { start: new Date(year - 1, 0, 1), end: new Date(year, 0, 1) };
      case "allTime":
        return { start: new Date(-8640000000000000), end: new Date(8640000000000000) };
      default:
        return { start: monthStart, end: addMonths(monthStart, 1) };
    }
  }

  function isInRange(date, range) {
    const time = date.getTime();
    return time >= range.start.getTime() && time < range.end.getTime();
  }

  function jpyAmount(transaction) {
    if (Number.isFinite(transaction.jpyAmount)) return transaction.jpyAmount;
    if (String(transaction.currency || "JPY").toUpperCase() === "JPY") return transaction.amount;
    if (transaction.fxRate > 0) return transaction.amount * transaction.fxRate;
    return 0;
  }

  function formatJPY(value) {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(finiteNumber(value));
  }

  function formatNative(value, currency) {
    const code = currency || "JPY";
    return new Intl.NumberFormat(code === "CNY" ? "en-US" : "ja-JP", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: code === "JPY" ? 0 : 2,
      maximumFractionDigits: code === "JPY" ? 0 : 2,
    }).format(finiteNumber(value));
  }

  function shortJPY(value) {
    const absolute = Math.abs(value);
    if (absolute >= 1000000) return `¥${(value / 1000000).toFixed(1)}m`;
    if (absolute >= 1000) return `¥${Math.round(value / 1000)}k`;
    return formatJPY(value);
  }

  function periodSummary() {
    const range = periodRange(state.period);
    const transactions = state.transactions.filter((transaction) => isInRange(transaction.dateObject, range));
    const expenses = transactions.filter((transaction) => isType(transaction, "expense")).reduce((sum, transaction) => sum + jpyAmount(transaction), 0);
    const income = transactions.filter((transaction) => isType(transaction, "income")).reduce((sum, transaction) => sum + jpyAmount(transaction), 0);
    const categoryTotals = new Map();

    transactions.forEach((transaction) => {
      if (!isType(transaction, "expense")) return;
      const category = String(transaction.category || "Other").trim() || "Other";
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + jpyAmount(transaction));
    });

    let categories = [...categoryTotals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    if (categories.length > 8) {
      const visible = categories.slice(0, 7);
      visible.push({ name: "Other", amount: categories.slice(7).reduce((sum, category) => sum + category.amount, 0) });
      categories = visible;
    }

    return { range, transactions, expenses, income, net: income - expenses, categories };
  }

  function categoryColors() {
    const styles = getComputedStyle(document.documentElement);
    return ["--accent", "--blue", "--olive", "--mauve", "--gold", "--accent-soft", "--faint", "--rule-strong"]
      .map((property) => styles.getPropertyValue(property).trim());
  }

  function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  function renderOverview(summary) {
    const monthly = ["thisMonth", "lastMonth", "twoMonthsAgo", "customMonth"].includes(state.period);
    els.periodLabel.textContent = monthly
      ? summary.range.start.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : state.period === "allTime" ? "All time" : String(summary.range.start.getFullYear());
    const parts = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).formatToParts(summary.expenses);
    els.expenseTotal.replaceChildren(...parts.map((part) => {
      const span = document.createElement("span");
      if (part.type === "currency") span.className = "currency-mark";
      span.textContent = part.value;
      return span;
    }));
    els.expenseTotal.setAttribute("aria-label", formatJPY(summary.expenses));
    els.incomeTotal.textContent = formatJPY(summary.income);
    els.netTotal.textContent = formatJPY(summary.net);
    els.transactionCount.textContent = new Intl.NumberFormat().format(summary.transactions.length);
    updateDateNavigation();
  }

  function setActiveCategory(name, categories, colors) {
    state.activeCategory = name;
    const total = categories.reduce((sum, category) => sum + category.amount, 0);
    const selected = categories.find((category) => category.name === name);

    els.donutSegments.querySelectorAll(".donut-segment").forEach((segment) => {
      const active = segment.dataset.category === name;
      segment.classList.toggle("is-active", Boolean(name && active));
      segment.classList.toggle("is-muted", Boolean(name && !active));
    });

    els.categoryList.querySelectorAll(".category-row").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.category === name);
      row.setAttribute("aria-pressed", String(row.dataset.category === name));
    });

    if (selected) {
      els.donutName.textContent = selected.name;
      els.donutValue.textContent = formatJPY(selected.amount);
      els.donutShare.textContent = total > 0 ? `${Math.round((selected.amount / total) * 100)}% of spending` : "0% of spending";
      els.donutValue.style.color = colors[categories.indexOf(selected) % colors.length];
    } else {
      els.donutName.textContent = "Total";
      els.donutValue.textContent = formatJPY(total);
      els.donutShare.textContent = "Selected period";
      els.donutValue.style.color = "";
    }
  }

  function renderCategories(summary) {
    const categories = summary.categories;
    const colors = categoryColors();
    const total = categories.reduce((sum, category) => sum + category.amount, 0);
    const circumference = 2 * Math.PI * 72;
    let offset = 0;

    state.activeCategory = null;
    els.donutSegments.replaceChildren();
    els.categoryList.replaceChildren();

    if (!categories.length || total <= 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No expenses in this period.";
      els.categoryList.appendChild(empty);
      els.donutName.textContent = "Total";
      els.donutValue.textContent = formatJPY(0);
      els.donutShare.textContent = "Selected period";
      els.donutDescription.textContent = "No expenses in this period.";
      return;
    }

    const description = categories.map((category) => `${category.name}: ${formatJPY(category.amount)}`).join("; ");
    els.donutDescription.textContent = description;

    categories.forEach((category, index) => {
      const color = colors[index % colors.length];
      const segmentLength = (category.amount / total) * circumference;
      const gap = Math.min(3, segmentLength * 0.12);
      const segment = createSvgElement("circle", {
        class: "donut-segment",
        cx: 100,
        cy: 100,
        r: 72,
        stroke: color,
        "stroke-dasharray": `${Math.max(0, segmentLength - gap)} ${circumference - Math.max(0, segmentLength - gap)}`,
        "stroke-dashoffset": -offset,
        tabindex: 0,
        role: "button",
        "aria-label": `${category.name}, ${formatJPY(category.amount)}, ${Math.round((category.amount / total) * 100)} percent`,
      });
      segment.dataset.category = category.name;
      segment.addEventListener("mouseenter", () => setActiveCategory(category.name, categories, colors));
      segment.addEventListener("mouseleave", () => setActiveCategory(null, categories, colors));
      segment.addEventListener("focus", () => setActiveCategory(category.name, categories, colors));
      segment.addEventListener("blur", () => setActiveCategory(null, categories, colors));
      segment.addEventListener("click", () => setActiveCategory(state.activeCategory === category.name ? null : category.name, categories, colors));
      segment.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setActiveCategory(category.name, categories, colors);
        }
        if (event.key === "Escape") setActiveCategory(null, categories, colors);
      });
      els.donutSegments.appendChild(segment);
      offset += segmentLength;

      const row = document.createElement("button");
      row.type = "button";
      row.className = "category-row";
      row.dataset.category = category.name;
      row.setAttribute("aria-label", `${category.name}: ${formatJPY(category.amount)}, ${Math.round((category.amount / total) * 100)} percent of spending`);

      const dot = document.createElement("span");
      dot.className = "category-dot";
      dot.style.background = color;
      dot.setAttribute("aria-hidden", "true");

      const name = document.createElement("span");
      name.className = "category-name";
      name.textContent = category.name;

      const value = document.createElement("span");
      value.className = "category-value";
      const amount = document.createElement("strong");
      amount.textContent = formatJPY(category.amount);
      const share = document.createElement("small");
      share.textContent = `${Math.round((category.amount / total) * 100)}%`;
      value.append(amount, share);
      row.append(dot, name, value);
      row.addEventListener("mouseenter", () => setActiveCategory(category.name, categories, colors));
      row.addEventListener("mouseleave", () => setActiveCategory(null, categories, colors));
      row.addEventListener("focus", () => setActiveCategory(category.name, categories, colors));
      row.addEventListener("blur", () => setActiveCategory(null, categories, colors));
      row.addEventListener("click", () => setActiveCategory(state.activeCategory === category.name ? null : category.name, categories, colors));
      els.categoryList.appendChild(row);
    });

    setActiveCategory(null, categories, colors);
  }

  function trailingMonths() {
    const yearView = ["thisYear", "lastYear", "customYear"].includes(state.period);
    const range = periodRange(state.period);
    const current = state.period === "allTime" ? startOfMonth(new Date()) : yearView ? new Date(range.start.getFullYear(), 11, 1) : range.start;
    return Array.from({ length: 12 }, (_, index) => {
      const start = addMonths(current, index - 11);
      const end = addMonths(start, 1);
      let expenses = 0;
      let income = 0;
      state.transactions.forEach((transaction) => {
        if (!isInRange(transaction.dateObject, { start, end })) return;
        if (isType(transaction, "expense")) expenses += jpyAmount(transaction);
        if (isType(transaction, "income")) income += jpyAmount(transaction);
      });
      return { start, expenses, income };
    });
  }

  function smoothPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
    return points.reduce((path, point, index) => {
      if (index === 0) return `M ${point[0]} ${point[1]}`;
      const previous = points[index - 1];
      const midpoint = (previous[0] + point[0]) / 2;
      return `${path} C ${midpoint} ${previous[1]}, ${midpoint} ${point[1]}, ${point[0]} ${point[1]}`;
    }, "");
  }

  function showTrendTooltip(event, month, xPosition, chartWidth) {
    const monthLabel = month.start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    els.trendTooltip.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = monthLabel;
    const expense = document.createElement("span");
    expense.append("Expenses", formatJPY(month.expenses));
    const income = document.createElement("span");
    income.append("Income", formatJPY(month.income));
    els.trendTooltip.append(title, expense, income);
    els.trendTooltip.hidden = false;

    const bounds = els.trendChart.getBoundingClientRect();
    const localX = event && Number.isFinite(event.clientX) ? event.clientX - bounds.left : (xPosition / chartWidth) * bounds.width;
    const tooltipWidth = els.trendTooltip.getBoundingClientRect().width;
    const left = Math.max(0, Math.min(bounds.width - tooltipWidth, localX - tooltipWidth / 2));
    els.trendTooltip.style.left = `${left}px`;
    els.trendTooltip.style.top = "0.5rem";
  }

  function hideTrendTooltip() {
    els.trendTooltip.hidden = true;
  }

  function renderTrend() {
    const months = trailingMonths();
    const yearView = ["thisYear", "lastYear", "customYear"].includes(state.period);
    $("trend-caption").textContent = yearView ? String(months[0].start.getFullYear()) + " · January–December" : "12 months to " + months[11].start.toLocaleDateString("en-US", {month:"short",year:"numeric"});
    const width = 720;
    const height = 300;
    const padding = { top: 30, right: 14, bottom: 46, left: 14 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maximum = Math.max(1, ...months.flatMap((month) => [month.expenses, month.income]));
    const x = (index) => padding.left + (innerWidth * index) / (months.length - 1);
    const y = (value) => padding.top + innerHeight - (value / maximum) * innerHeight;
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue("--accent").trim();
    const blue = styles.getPropertyValue("--blue").trim();

    const title = createSvgElement("title", { id: "trend-chart-title" });
    title.textContent = "Income and expense trend";
    els.trendDescription = createSvgElement("desc", { id: "trend-chart-description" });
    hideTrendTooltip();
    els.trendChart.replaceChildren(title, els.trendDescription);

    [0, 0.5, 1].forEach((portion) => {
      const yPosition = padding.top + innerHeight * portion;
      els.trendChart.appendChild(createSvgElement("line", {
        class: "chart-grid-line",
        x1: padding.left,
        y1: yPosition,
        x2: width - padding.right,
        y2: yPosition,
      }));
    });

    const expensePoints = months.map((month, index) => [x(index), y(month.expenses)]);
    const incomePoints = months.map((month, index) => [x(index), y(month.income)]);
    els.trendChart.appendChild(createSvgElement("path", { class: "chart-line chart-expense", d: smoothPath(expensePoints) }));
    els.trendChart.appendChild(createSvgElement("path", { class: "chart-line chart-income", d: smoothPath(incomePoints) }));

    months.forEach((month, index) => {
      if (index % 2 === 0 || index === months.length - 1) {
        const label = createSvgElement("text", {
          class: "chart-label",
          x: x(index),
          y: height - 13,
          "text-anchor": index === 0 ? "start" : index === months.length - 1 ? "end" : "middle",
        });
        label.textContent = month.start.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
        els.trendChart.appendChild(label);
      }

      els.trendChart.appendChild(createSvgElement("circle", { class: "chart-dot", cx: x(index), cy: y(month.expenses), r: 4, fill: accent }));
      els.trendChart.appendChild(createSvgElement("circle", { class: "chart-dot", cx: x(index), cy: y(month.income), r: 4, fill: blue }));

      const hitWidth = innerWidth / (months.length - 1);
      const hit = createSvgElement("rect", {
        class: "chart-hit-area",
        x: Math.max(0, x(index) - hitWidth / 2),
        y: padding.top,
        width: Math.min(width, x(index) + hitWidth / 2) - Math.max(0, x(index) - hitWidth / 2),
        height: innerHeight,
        tabindex: 0,
        role: "button",
        "aria-label": `${month.start.toLocaleDateString("en-US", { month: "long", year: "numeric" })}: expenses ${formatJPY(month.expenses)}, income ${formatJPY(month.income)}`,
      });
      hit.addEventListener("pointerenter", (event) => showTrendTooltip(event, month, x(index), width));
      hit.addEventListener("pointermove", (event) => showTrendTooltip(event, month, x(index), width));
      hit.addEventListener("pointerleave", hideTrendTooltip);
      hit.addEventListener("focus", (event) => showTrendTooltip(event, month, x(index), width));
      hit.addEventListener("blur", hideTrendTooltip);
      hit.addEventListener("click", (event) => showTrendTooltip(event, month, x(index), width));
      hit.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideTrendTooltip();
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showTrendTooltip(null, month, x(index), width);
        }
      });
      els.trendChart.appendChild(hit);
    });

    els.trendDescription.textContent = months
      .map((month) => `${month.start.toLocaleDateString("en-US", { month: "long", year: "numeric" })}: expenses ${formatJPY(month.expenses)}, income ${formatJPY(month.income)}`)
      .join("; ");
  }

  function isCreditAccount(account) {
    return /credit|card|liabil/i.test(account.type);
  }

  function accountDate(value) {
    if (!value) return null;
    const text = String(value);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(text + "T00:00:00") : new Date(text);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text) && (date.getFullYear() !== Number(text.slice(0, 4)) || date.getMonth() + 1 !== Number(text.slice(5, 7)) || date.getDate() !== Number(text.slice(8, 10)))) return null;
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function accountFx(account, asOf = new Date()) {
    if (account.currency === "JPY") return { rate: 1, date: null };
    const valuationDate = accountDate(account.valuationDate);
    if (hasNumber(account.valuationRate) && Number(account.valuationRate) > 0 && valuationDate && valuationDate <= asOf) {
      return { rate: Number(account.valuationRate), date: valuationDate };
    }
    const transaction = state.transactions.find((item) => String(item.currency || "").toUpperCase() === account.currency && item.fxRate > 0 && item.dateObject <= asOf);
    return transaction ? { rate: transaction.fxRate, date: transaction.dateObject } : null;
  }

  function knownJPY(transaction) {
    if (Number.isFinite(transaction.jpyAmount)) return transaction.jpyAmount;
    if (String(transaction.currency || "JPY").toUpperCase() === "JPY") return transaction.amount;
    return transaction.fxRate > 0 ? transaction.amount * transaction.fxRate : null;
  }

  function nativeAmount(transaction, account) {
    if (isType(transaction, "transfer") && String(transaction.toAccount || "").trim() === account.name && hasNumber(transaction.toAmount)) {
      return Number(transaction.toAmount);
    }
    const txCurrency = String(transaction.currency || "JPY").toUpperCase();
    if (txCurrency === account.currency) return transaction.amount;
    const jpy = knownJPY(transaction);
    if (account.currency === "JPY") return jpy;
    if (jpy === null || !account.fx) return null;
    account.issues.add("Some account movements are estimated using the latest available exchange rate.");
    return jpy / account.fx.rate;
  }

  function accountBalances(asOf = new Date()) {
    const accounts = state.accounts.map((account) => {
      const openingDate = accountDate(account.openingDate);
      const issues = new Set();
      if (!account.openingBalanceKnown) issues.add("No opening balance recorded; zero is assumed.");
      if (!openingDate) issues.add("No valid opening date recorded; all loaded entries are applied.");
      if (openingDate && openingDate > asOf) issues.add("The opening balance is dated in the future.");
      return { ...account, balance: account.openingBalance, balanceKnown: !openingDate || openingDate <= asOf, openingDate, issues, fx: accountFx(account, asOf) };
    });
    const byName = new Map(accounts.map((account) => [account.name, account]));
    const duplicateNames = new Set();
    const seenNames = new Set();
    accounts.forEach((account) => {
      if (seenNames.has(account.name)) duplicateNames.add(account.name);
      seenNames.add(account.name);
    });
    accounts.forEach((account) => {
      if (duplicateNames.has(account.name)) {
        account.balanceKnown = false;
        account.issues.add("The account name is duplicated; its balance is unavailable.");
      }
    });

    function move(account, transaction, incoming) {
      if (!account || (account.openingDate && transaction.dateObject < account.openingDate)) return;
      const amount = nativeAmount(transaction, account);
      if (amount === null) {
        account.balanceKnown = false;
        account.issues.add("A currency conversion is missing; the balance cannot be calculated.");
        return;
      }
      const sign = incoming ? 1 : -1;
      account.balance += amount * sign * (isCreditAccount(account) ? -1 : 1);
    }

    [...state.transactions].reverse().forEach((transaction) => {
      if (transaction.dateObject > asOf) return;
      const from = byName.get(String(transaction.account || "").trim());
      const to = byName.get(String(transaction.toAccount || "").trim());
      const type = normalizedType(transaction.type);

      if (type === "expense" && from) {
        move(from, transaction, false);
      } else if (type === "income" && from) {
        move(from, transaction, true);
      } else if (type === "transfer") {
        move(from, transaction, false);
        move(to, transaction, true);
      } else if (["record payment", "payment", "credit card payment"].includes(type)) {
        if (from && to && isCreditAccount(from) && !isCreditAccount(to)) {
          move(to, transaction, false);
          move(from, transaction, true);
        } else {
          move(from, transaction, false);
          move(to, transaction, true);
        }
      }
    });

    return accounts;
  }

  function assetSummary(balances) {
    const assets = balances.filter((account) => !isCreditAccount(account) && account.includeInAssets !== false);
    const valued = assets.filter((account) => account.balanceKnown && account.fx);
    const notes = [];
    assets.forEach((account) => {
      account.issues.forEach((issue) => notes.push(account.name + ": " + issue));
      if (!account.fx) notes.push(account.name + ": no JPY exchange rate; excluded from the subtotal.");
      else if (account.currency !== "JPY") notes.push(account.name + ": valued at ¥" + account.fx.rate.toFixed(4) + " per " + account.currency + " (" + account.fx.date.toLocaleDateString("en-CA") + ").");
      if (!account.balanceKnown) notes.push(account.name + ": balance unavailable; excluded from the subtotal.");
    });
    const names = new Set(balances.map((account) => account.name));
    const unknown = new Set();
    state.transactions.forEach((transaction) => {
      [transaction.account, transaction.toAccount].forEach((name) => {
        const key = String(name || "").trim();
        if (key && !names.has(key)) unknown.add(key);
      });
    });
    if (unknown.size) notes.push("Accounts missing from the account list: " + [...unknown].join(", ") + ". Their balances are not included.");
    if (state.skippedLines) notes.push(state.skippedLines + " unreadable ledger lines were skipped.");
    if (names.size !== balances.length) notes.push("The account list contains duplicate names; review those balances.");
    return { total: valued.reduce((sum, account) => sum + account.balance * account.fx.rate, 0), count: valued.length, expected: assets.length, notes };
  }

  function renderAccountGroup(title, accounts) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.className = "account-group-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (!accounts.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = `No ${title.toLowerCase()} configured.`;
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement("dl");
    list.className = "account-list";
    accounts.forEach((account) => {
      const row = document.createElement("div");
      row.className = "account-row";
      const term = document.createElement("dt");
      const name = document.createElement("span");
      name.className = "account-name";
      name.textContent = account.name;
      const type = document.createElement("span");
      type.className = "account-type";
      type.textContent = account.type;
      term.append(name, type);
      if (state.accountsDocument) {
        const edit = document.createElement("button");
        edit.className = "account-edit"; edit.type = "button";
        edit.textContent = "Edit"; edit.setAttribute("aria-label", "Edit " + account.name);
        edit.addEventListener("click", () => openAccountEditor(LedgerFiles.rowsOf(state.accountsDocument).findIndex(row => row.name.trim() === account.name)));
        term.appendChild(edit);
      }

      const value = document.createElement("dd");
      const balance = document.createElement("span");
      balance.className = "account-balance";
      balance.textContent = account.balanceKnown ? formatNative(account.balance, account.currency) : "Unavailable";
      value.appendChild(balance);

      if (account.currency !== "JPY" || !account.balanceKnown) {
        const conversion = document.createElement("span");
        conversion.className = "account-conversion";
        conversion.textContent = !account.balanceKnown ? "Balance needs review" : account.fx ? `${formatJPY(account.balance * account.fx.rate)} · ¥${account.fx.rate.toFixed(2)}/${account.currency}` : "JPY rate unavailable";
        value.appendChild(conversion);
      }

      if (!account.balanceKnown && isCreditAccount(account)) {
        const reason = document.createElement("span");
        reason.className = "account-conversion";
        reason.textContent = [...account.issues].join(" ");
        value.appendChild(reason);
      }

      row.append(term, value);
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderAccounts() {
    const balances = accountBalances();
    const assets = balances.filter((account) => !isCreditAccount(account));
    const cards = balances.filter(isCreditAccount);
    els.accountGroups.replaceChildren(renderAccountGroup("Assets", assets), renderAccountGroup("Credit cards", cards));
    $("export-accounts").hidden = !state.accountsDirty;
    $("add-account").disabled = !state.accountsDocument;
    $("account-status").textContent = state.accountsDirty ? "Draft changes · Save your account file to iCloud, then reopen it here to verify." : state.accountsDocument ? "" : "Open your accounts file to add or edit accounts.";

    els.accountsCaption.textContent = "Current balances · All loaded history";
    const subtotal = assetSummary(balances);
    els.assetSubtotal.textContent = subtotal.count ? formatJPY(subtotal.total) : "—";
    els.assetScope.textContent = subtotal.count + " of " + subtotal.expected + " asset accounts valued in JPY. Credit cards are excluded.";
    els.assetNotes.replaceChildren();
    const notes = ["Calculated from recorded opening balances and loaded transactions through today. Opening balances and completeness have not been verified.", ...subtotal.notes];
    notes.forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      els.assetNotes.appendChild(item);
    });
  }

  function transactionTitle(transaction) {
    return String(transaction.merchant || transaction.category || transaction.type || "Transaction").trim();
  }

  function transactionAmountPrefix(transaction) {
    if (isType(transaction, "income")) return "+";
    if (isType(transaction, "expense")) return "−";
    return "";
  }

  function transactionSelection(summary) {
    const filter = state.transactionFilter;
    if (!filter) return { transactions: summary.transactions, label: selectedPeriodLabel() };
    const transactions = state.transactions.filter((transaction) => isType(transaction, "expense") && categoryName(transaction) === filter.category && transaction.dateObject.getFullYear() === filter.year && transaction.dateObject.getMonth() === filter.month);
    const month = new Date(filter.year, filter.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    return { transactions, label: filter.category + " · " + month };
  }

  function transactionPage(transactions, page) {
    const pages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
    const current = Math.min(pages, Math.max(1, Math.trunc(finiteNumber(page, 1))));
    const start = (current - 1) * PAGE_SIZE;
    return { current, pages, start, rows: transactions.slice(start, start + PAGE_SIZE), total: transactions.length };
  }

  function renderRecent(summary) {
    els.recentList.replaceChildren();
    const selection = transactionSelection(summary);
    const page = transactionPage(selection.transactions, state.page);
    state.page = page.current;
    const recent = page.rows;
    els.recentCaption.textContent = selection.label + " · Latest first";
    els.clearTransactionFilter.hidden = !state.transactionFilter;
    els.recentCount.textContent = page.total ? `${page.start + 1}–${page.start + recent.length} of ${page.total.toLocaleString()} transactions` : "0 transactions";
    els.pagePrevious.disabled = page.current === 1;
    els.pageNext.disabled = page.current === page.pages;
    els.pageNumber.value = page.current;
    els.pageNumber.max = page.pages;
    els.pageNumber.disabled = page.pages === 1;
    els.pageTotal.textContent = "of " + page.pages.toLocaleString();
    els.recentList.start = page.start + 1;
    if (!recent.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = "No transactions in this period.";
      els.recentList.appendChild(empty);
      return;
    }

    recent.forEach((transaction) => {
      const row = document.createElement("li");
      row.className = "transaction-row";
      row.dataset.kind = normalizedType(transaction.type).replace(/\s+/g, "-");

      const date = document.createElement("time");
      date.className = "transaction-date";
      date.dateTime = transaction.dateObject.toISOString();
      const month = document.createElement("span");
      month.textContent = transaction.dateObject.toLocaleDateString("en-US", { month: "short" });
      const day = document.createElement("strong");
      day.textContent = transaction.dateObject.toLocaleDateString("en-US", { day: "2-digit" });
      const year = document.createElement("span");
      year.textContent = transaction.dateObject.getFullYear();
      date.append(month, day, year);

      const detail = document.createElement("div");
      const title = document.createElement("span");
      title.className = "transaction-title";
      title.textContent = transactionTitle(transaction);
      const meta = document.createElement("span");
      meta.className = "transaction-meta";
      const route = transaction.toAccount ? `${transaction.account || "—"} → ${transaction.toAccount}` : transaction.account || "—";
      meta.textContent = [transaction.type, route, transaction.note].filter(Boolean).join(" · ");
      detail.append(title, meta);

      const value = document.createElement("div");
      const amount = document.createElement("span");
      amount.className = "transaction-amount";
      amount.textContent = `${transactionAmountPrefix(transaction)}${formatJPY(Math.abs(jpyAmount(transaction)))}`;
      value.appendChild(amount);

      const currency = String(transaction.currency || "JPY").toUpperCase();
      if (currency !== "JPY") {
        const native = document.createElement("span");
        native.className = "transaction-native";
        native.textContent = formatNative(transaction.amount, currency);
        value.appendChild(native);
      }

      row.append(date, detail, value);
      els.recentList.appendChild(row);
    });
  }

  function changePage(page) {
    state.page = page;
    renderRecent(periodSummary());
    els.recentTitle.scrollIntoView({ block: "start" });
    els.recentTitle.focus({ preventScroll: true });
  }

  function clearTransactionSelection() {
    state.transactionFilter = null;
    state.page = 1;
    renderRecent(periodSummary());
    renderRhythms();
  }

  function rhythmData(year) {
    const categories = new Map();
    state.transactions.forEach((transaction) => {
      if (!isType(transaction, "expense") || transaction.dateObject.getFullYear() !== year) return;
      const name = categoryName(transaction);
      if (!categories.has(name)) categories.set(name, { name, months: Array(12).fill(0), counts: Array(12).fill(0), total: 0 });
      const category = categories.get(name);
      const month = transaction.dateObject.getMonth();
      const amount = jpyAmount(transaction);
      category.months[month] += amount;
      category.counts[month] += 1;
      category.total += amount;
    });
    return [...categories.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  function renderRhythms() {
    const categories = rhythmData(state.rhythmYear);
    const largest = categories.reduce((max, category) => Math.max(max, ...category.months.map(Math.abs)), 0);
    els.rhythmBody.replaceChildren();
    els.rhythmEmpty.hidden = categories.length > 0;
    els.rhythmTable.hidden = !categories.length;
    els.rhythmTableCaption.textContent = "Category spending by month in " + state.rhythmYear + ", in JPY. Darker cells indicate larger amounts on the same scale across all categories.";
    categories.forEach((category) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = category.name;
      row.appendChild(name);
      category.months.forEach((amount, month) => {
        const cell = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rhythm-cell";
        const monthLabel = new Date(state.rhythmYear, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        const count = category.counts[month];
        button.setAttribute("aria-label", category.name + ", " + monthLabel + ": " + formatJPY(amount) + ", " + count + (count === 1 ? " expense" : " expenses"));
        button.title = button.getAttribute("aria-label");
        button.style.setProperty("--rhythm-strength", largest && amount ? String(0.14 + 0.76 * Math.abs(amount) / largest) : "0");
        const filter = state.transactionFilter;
        button.setAttribute("aria-pressed", String(Boolean(filter && filter.year === state.rhythmYear && filter.month === month && filter.category === category.name)));
        if (!count) button.textContent = "·";
        button.addEventListener("click", () => {
          state.transactionFilter = { year: state.rhythmYear, month, category: category.name };
          state.page = 1;
          els.rhythmBody.querySelectorAll(".rhythm-cell").forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
          renderRhythmSelection();
          renderRecent(periodSummary());
        });
        cell.appendChild(button);
        row.appendChild(cell);
      });
      const total = document.createElement("td");
      total.className = "rhythm-total";
      total.textContent = formatJPY(category.total);
      row.appendChild(total);
      els.rhythmBody.appendChild(row);
    });
    renderRhythmSelection();
  }

  function renderRhythmSelection() {
    const filter = state.transactionFilter;
    els.rhythmView.hidden = !filter;
    if (!filter) {
      els.rhythmSelection.textContent = "Tap a month to inspect its spending. Swipe across to see the whole year.";
      return;
    }
    const selection = transactionSelection(periodSummary());
    const total = selection.transactions.reduce((sum, transaction) => sum + jpyAmount(transaction), 0);
    els.rhythmSelection.textContent = selection.label + " · " + formatJPY(total) + " · " + selection.transactions.length + (selection.transactions.length === 1 ? " expense" : " expenses");
  }

  function bindHistoryControls() {
    els.pagePrevious.addEventListener("click", () => changePage(state.page - 1));
    els.pageNext.addEventListener("click", () => changePage(state.page + 1));
    els.pageForm.addEventListener("submit", (event) => {
      event.preventDefault();
      changePage(els.pageNumber.value);
    });
    els.clearTransactionFilter.addEventListener("click", () => {
      clearTransactionSelection();
      els.recentTitle.focus({ preventScroll: true });
    });
    updateRhythmYears();
    els.rhythmYear.addEventListener("change", () => {
      state.rhythmYear = Number(els.rhythmYear.value);
      clearTransactionSelection();
    });
    els.rhythmView.addEventListener("click", () => {
      els.recentTitle.scrollIntoView({ block: "start" });
      els.recentTitle.focus({ preventScroll: true });
    });
  }

  function renderPeriod() {
    const summary = periodSummary();
    renderOverview(summary);
    renderCategories(summary);
    renderRecent(summary);
    renderTrend();
  }

  function setNotice(message) {
    els.notice.hidden = false;
    els.noticeCopy.textContent = message;
  }

  function bindPeriodControls() {
    document.querySelectorAll('.period-button').forEach(button => button.addEventListener('click', () => {
      selectPeriod(button.dataset.period);
      button.scrollIntoView({block:'nearest', inline:'nearest'});
    }));
    $('choose-date').addEventListener('click', () => {
      const range = periodRange(state.period);
      const date = state.period === 'allTime' ? new Date() : range.start;
      const yearMode = ['thisYear','lastYear','customYear'].includes(state.period);
      $('date-view-year').checked = yearMode; $('date-view-month').checked = !yearMode;
      $('date-year').value = date.getFullYear(); $('date-month').value = date.getMonth();
      $('date-month-label').hidden = $('date-view-year').checked;
      $('date-dialog').showModal();
    });
    $('date-mode').addEventListener('change', () => $('date-month-label').hidden = $('date-view-year').checked);
    const adjustYear = direction => {
      const year = Number($('date-year').value);
      $('date-year').value = Math.min(9998, Math.max(1900, (Number.isFinite(year) ? year : new Date().getFullYear()) + direction));
    };
    $('picker-year-back').addEventListener('click', () => adjustYear(-1));
    $('picker-year-forward').addEventListener('click', () => adjustYear(1));
    $('date-form').addEventListener('submit', event => {
      event.preventDefault();
      const year=Number($('date-year').value), month=Number($('date-month').value);
      if (!Number.isInteger(year) || year<1900 || year>9998) return;
      state.customYear=year; state.customMonth=month;
      selectPeriod($('date-view-year').checked ? 'customYear' : 'customMonth');
      $('date-dialog').close(); $('choose-date').focus();
    });
    $('period-back').addEventListener('click', () => movePeriod(-1));
    $('period-forward').addEventListener('click', () => movePeriod(1));
  }

  function selectedPeriodLabel() {
    if (state.period === 'customMonth') return new Date(state.customYear,state.customMonth,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    if (state.period === 'customYear') return String(state.customYear);
    return PERIOD_LABELS[state.period];
  }

  function updateDateNavigation() {
    const yearView = ['thisYear','lastYear','customYear'].includes(state.period);
    const range = periodRange(state.period);
    const all = state.period === 'allTime';
    $('period-back').disabled = all || range.start.getFullYear() <= 1900 && (yearView || range.start.getMonth() === 0);
    $('period-forward').disabled = all || range.start.getFullYear() >= 9998 && (yearView || range.start.getMonth() === 11);
    $('period-back').setAttribute('aria-label',yearView?'Previous year':'Previous month');
    $('period-forward').setAttribute('aria-label',yearView?'Next year':'Next month');
    document.querySelectorAll('.period-button').forEach(button => {
      const active = button.dataset.period === state.period;
      button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
    });
  }

  function selectPeriod(period) {
    state.period=period;state.page=1;state.transactionFilter=null;
    renderPeriod(); renderRhythms();
  }

  function movePeriod(direction) {
    if (state.period === 'allTime') return;
    const range=periodRange(state.period);
    const yearView=['thisYear','lastYear','customYear'].includes(state.period);
    const date=yearView?new Date(range.start.getFullYear()+direction,0,1):addMonths(range.start,direction);
    if (date.getFullYear()<1900 || date.getFullYear()>9998) return;
    state.customYear=date.getFullYear();state.customMonth=date.getMonth();
    selectPeriod(yearView?'customYear':'customMonth');
  }

  function updateRhythmYears() {
    const years=[...new Set(state.transactions.map(t=>t.dateObject.getFullYear()))].sort((a,b)=>b-a);
    const current=new Date().getFullYear();
    if (!years.length) years.push(current);
    if (!years.includes(state.rhythmYear)) state.rhythmYear=years.includes(current)?current:years[0];
    els.rhythmYear.replaceChildren();
    years.forEach(year=>{const option=document.createElement('option');option.value=year;option.textContent=year;els.rhythmYear.append(option);});
    els.rhythmYear.value=state.rhythmYear;
  }

  function openAccountEditor(index) {
    if (!state.accountsDocument) return;
    state.editingAccount=index;
    const row=index===null?{}:LedgerFiles.rowsOf(state.accountsDocument)[index];
    if (!row) return;
    const existing=index!==null;
    $('account-form').reset();$('account-error').textContent='';
    $('account-editor-title').textContent=existing?'Edit opening details':'Add an account';
    $('account-name').value=row.name || ''; $('account-name').readOnly=existing;
    const type=String(row.type || (existing ? 'Account' : 'Bank')).trim();
    $('account-type').querySelectorAll('[data-legacy]').forEach(option=>option.remove());
    if (![...$('account-type').options].some(option=>option.value===type)) {
      const option=document.createElement('option');option.value=type;option.textContent=type;option.dataset.legacy='true';$('account-type').append(option);
    }
    $('account-type').value=existing?String(row.type || 'Account').trim():type;
    $('account-type').disabled=existing;
    $('account-currency').value=String(row.currency || 'JPY').trim().toUpperCase();$('account-currency').readOnly=existing;
    $('account-opening').value=hasNumber(row.openingBalance)?row.openingBalance:existing?'':'0';
    const now=new Date(); const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    $('account-date').value=row.openingDate?String(row.openingDate).slice(0,10):existing?'':today;
    $('account-opening').required=!existing;$('account-date').required=!existing;
    const card=isCreditAccount({type:$('account-type').value});
    $('account-include').checked=!card && row.includeInAssets!==false;$('account-include').disabled=card;
    $('account-identity-note').hidden=!existing;
    $('account-dialog').showModal();
  }

  let importWorker=null;
  let cancelImport=null;
  let verifyingAccounts=false;

  function openFileDialog(verify=false) {
    verifyingAccounts=verify;
    $('files-form').reset();$('import-status').textContent='';
    $('ledger-files').disabled=verify;
    $('accounts-file').required=verify;
    $('files-dialog').showModal();
  }

  function finishImport(result) {
    if (verifyingAccounts && (!result.accounts || LedgerFiles.canonical(result.accounts)!==LedgerFiles.canonical(state.accountsDocument))) {
      throw Error('This file does not match your draft. Save the updated account file to iCloud, then choose that file. Your draft is unchanged.');
    }
    if (result.accounts && state.accountsDirty && !verifyingAccounts && LedgerFiles.canonical(result.accounts)!==LedgerFiles.canonical(state.accountsDocument) && !window.confirm('This accounts file differs from your unsaved draft. Replace the draft with this file?')) return;
    if (result.transactions!==null) {state.transactions=result.transactions;state.skippedLines=result.skipped;}
    if (result.accounts) {
      state.accountsFilename=result.accountsFilename || state.accountsFilename;
      state.accountsDocument=result.accounts;state.savedAccounts=LedgerFiles.canonical(result.accounts);state.accountsDirty=false;
      state.accounts=parseAccounts(JSON.stringify(result.accounts));
    }
    state.page=1;state.transactionFilter=null;
    updateRhythmYears(); renderPeriod();renderRhythms();renderAccounts();
    const skipped=state.skippedLines?' '+state.skippedLines.toLocaleString()+' unreadable lines were skipped; totals may be incomplete.':'';
    setNotice((verifyingAccounts?'Reopened account file matches your changes. ':'Loaded locally. ')+state.transactions.length.toLocaleString()+' transactions available.'+skipped);
    $('files-dialog').close();
  }

  async function importSelectedFiles(event) {
    event.preventDefault();
    const ledgerFiles=[...$('ledger-files').files];const accountsFile=$('accounts-file').files[0] || null;
    if (!ledgerFiles.length && !accountsFile) {$('import-status').textContent='Choose a ledger file, an accounts file, or both.';return;}
    if (importWorker) return;
    $('import-submit').disabled=true;$('import-status').textContent='Reading files…';
    try {
      const result=await new Promise((resolve,reject)=>{
        const worker=new Worker('file-worker.js');importWorker=worker;
        cancelImport=()=>{worker.terminate();importWorker=null;cancelImport=null;reject(Error('Import cancelled. Your current view is unchanged.'));};
        worker.onmessage=({data})=>{
          if (data.kind==='progress') {$('import-status').textContent='Reading ledger · '+data.percent+'%';return;}
          worker.terminate();importWorker=null;cancelImport=null;
          if (data.kind==='ready') resolve(data);else reject(Error(data.message));
        };
        worker.onerror=()=>{worker.terminate();importWorker=null;cancelImport=null;reject(Error('The file reader could not start. Reopen the dashboard online and try again.'));};
        worker.postMessage({ledgerFiles,accountsFile});
      });
      finishImport(result);
    } catch(error) {$('import-status').textContent=error.message;}
    finally {$('import-submit').disabled=false;}
  }

  function accountFile() {
    return new File([JSON.stringify(state.accountsDocument,null,2)+'\n'],state.accountsFilename,{type:/\.txt$/i.test(state.accountsFilename)?'text/plain':'application/json'});
  }

  function openSaveDialog() {
    if (!state.accountsDirty) return;
    $('save-status').textContent='';
    $('account-save-name').textContent=state.accountsFilename;
    $('save-summary').textContent=LedgerFiles.rowsOf(state.accountsDocument).length+' accounts · Updated opening details included';
    const file=accountFile();
    $('share-accounts').hidden=!(navigator.canShare && navigator.canShare({files:[file]}));
    $('save-dialog').showModal();
  }

  function bindFileAndAccountControls() {
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.close).close()));
    $('open-files').addEventListener('click',()=>openFileDialog());
    $('files-form').addEventListener('submit',importSelectedFiles);
    $('files-dialog').addEventListener('close',()=>{
      if(cancelImport) cancelImport();
      $('import-submit').disabled=false;
    });
    $('add-account').addEventListener('click',()=>openAccountEditor(null));
    $('account-type').addEventListener('change',()=>{
      const card=isCreditAccount({type:$('account-type').value});
      $('account-include').disabled=card;$('account-include').checked=!card;
    });
    $('account-form').addEventListener('submit',event=>{
      event.preventDefault();
      try {
        const next=LedgerFiles.editAccount(state.accountsDocument,state.editingAccount,{
          name:$('account-name').value,type:$('account-type').value,currency:$('account-currency').value,
          openingBalance:$('account-opening').value,openingDate:$('account-date').value,includeInAssets:$('account-include').checked
        });
        state.accountsDocument=next;state.accountsDirty=LedgerFiles.canonical(next)!==state.savedAccounts;
        state.accounts=parseAccounts(JSON.stringify(next));renderAccounts();$('account-dialog').close();
        if(state.accountsDirty) $('export-accounts').focus();
      }catch(error){$('account-error').textContent=error.message;}
    });
    $('export-accounts').addEventListener('click',openSaveDialog);
    $('share-accounts').addEventListener('click',async()=>{
      try {await navigator.share({files:[accountFile()]});$('save-status').textContent='File shared. Reopen the saved account file to verify it; sharing alone does not confirm an iCloud save.';}
      catch(error){$('save-status').textContent=error.name==='AbortError'?'Sharing cancelled. Your draft is still here.':'Sharing is unavailable. Use Download file instead.';}
    });
    $('download-accounts').addEventListener('click',()=>{
      const url=URL.createObjectURL(accountFile());const link=document.createElement('a');link.href=url;link.download=state.accountsFilename;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('save-status').textContent='Download prepared. Move the file to your iCloud Personal Ledger folder, then reopen it here. Your draft remains until verified.';
    });
    $('verify-accounts').addEventListener('click',()=>{$('save-dialog').close();openFileDialog(true);});
    window.addEventListener('beforeunload',event=>{if(state.accountsDirty){event.preventDefault();event.returnValue='';}});
  }

  function cacheElements() {
    Object.assign(els, {
      issueMonth: $("issue-month"),
      issueYear: $("issue-year"),
      notice: $("notice"),
      noticeCopy: $("notice-copy"),
      periodLabel: $("period-label"),
      expenseTotal: $("expense-total"),
      incomeTotal: $("income-total"),
      netTotal: $("net-total"),
      transactionCount: $("transaction-count"),
      donutSegments: $("donut-segments"),
      donutDescription: $("donut-description"),
      donutName: $("donut-name"),
      donutValue: $("donut-value"),
      donutShare: $("donut-share"),
      categoryList: $("category-list"),
      trendChart: $("trend-chart"),
      trendDescription: $("trend-chart-description"),
      trendTooltip: $("trend-tooltip"),
      accountGroups: $("account-groups"),
      accountsCaption: $("accounts-caption"),
      recentList: $("recent-list"),
      recentTitle: $("recent-title"),
      recentCaption: $("recent-caption"),
      recentCount: $("recent-count"),
      clearTransactionFilter: $("clear-transaction-filter"),
      pagePrevious: $("page-previous"),
      pageNext: $("page-next"),
      pageNumber: $("page-number"),
      pageTotal: $("page-total"),
      pageForm: $("page-form"),
      assetSubtotal: $("asset-subtotal"),
      assetScope: $("asset-scope"),
      assetNotes: $("asset-notes"),
      rhythmYear: $("rhythm-year"),
      rhythmTable: $("rhythm-table"),
      rhythmTableCaption: $("rhythm-table-caption"),
      rhythmBody: $("rhythm-body"),
      rhythmEmpty: $("rhythm-empty"),
      rhythmSelection: $("rhythm-selection"),
      rhythmView: $("rhythm-view"),
    });
  }

  function init() {
    cacheElements();
    const now = new Date();
    els.issueMonth.textContent = now.toLocaleDateString("en-US", { month: "short" });
    els.issueYear.textContent = now.getFullYear();

    const payload = readFragment(rawFragment);
    const parsedLedger = parseLedger(payload.ledgerText);
    state.transactions = parsedLedger.transactions;
    state.skippedLines = parsedLedger.skipped;
    state.accounts = parseAccounts(payload.accountsText);
    if (payload.accountsText) {
      try { state.accountsDocument = LedgerFiles.accountsDocument(payload.accountsText); state.savedAccounts = LedgerFiles.canonical(state.accountsDocument); } catch (_) { /* Existing read-only balances remain available; editing requires a valid complete account file. */ }
    }

    if (!rawFragment) {
      setNotice("Open your ledger files from iCloud Drive, or use your existing iPhone Shortcut.");
    } else if (!payload.ledgerText && !payload.accountsText) {
      setNotice("The private data fragment could not be read. Rebuild the Shortcut using the included guide.");
    } else if (state.skippedLines > 0) {
      setNotice(`Loaded locally. ${state.skippedLines} malformed ledger ${state.skippedLines === 1 ? "line was" : "lines were"} skipped.`);
    }

    bindFileAndAccountControls();
    bindPeriodControls();
    bindHistoryControls();
    renderPeriod();
    renderRhythms();
    renderAccounts();

    const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const redrawForTheme = () => {
      renderCategories(periodSummary());
      renderTrend();
    };
    if (themeQuery.addEventListener) themeQuery.addEventListener("change", redrawForTheme);

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}), { once: true });
    }
  }

  init();
})();
