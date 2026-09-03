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
  };

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
      .map((line) => {
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
            jpyAmount: finiteNumber(transaction.jpyAmount, NaN),
            dateObject: date,
          };
        } catch (_) {
          skipped += 1;
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.dateObject - a.dateObject);

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
          name: account.name.trim(),
          type: String(account.type || "Account").trim(),
          currency: String(account.currency || "JPY").trim().toUpperCase(),
          openingBalance: finiteNumber(account.openingBalance),
        }));
    } catch (_) {
      return [];
    }
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
    els.periodLabel.textContent = PERIOD_LABELS[state.period];
    els.expenseTotal.textContent = formatJPY(summary.expenses);
    els.incomeTotal.textContent = formatJPY(summary.income);
    els.netTotal.textContent = formatJPY(summary.net);
    els.transactionCount.textContent = new Intl.NumberFormat().format(summary.transactions.length);
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
    const current = startOfMonth(new Date());
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
    const tooltipWidth = Math.min(170, bounds.width * 0.55);
    const left = Math.max(0, Math.min(bounds.width - tooltipWidth, localX - tooltipWidth / 2));
    els.trendTooltip.style.left = `${left}px`;
    els.trendTooltip.style.top = "0.5rem";
  }

  function hideTrendTooltip() {
    els.trendTooltip.hidden = true;
  }

  function renderTrend() {
    const months = trailingMonths();
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

    els.trendChart.replaceChildren();

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
        x: x(index) - hitWidth / 2,
        y: padding.top,
        width: hitWidth,
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
      els.trendChart.appendChild(hit);
    });

    els.trendDescription.textContent = months
      .map((month) => `${month.start.toLocaleDateString("en-US", { month: "long", year: "numeric" })}: expenses ${formatJPY(month.expenses)}, income ${formatJPY(month.income)}`)
      .join("; ");
  }

  function isCreditAccount(account) {
    return /credit|card|liabil/i.test(account.type);
  }

  function latestFxRate(currency) {
    if (currency === "JPY") return 1;
    const transaction = state.transactions.find((item) => String(item.currency || "").toUpperCase() === currency && item.fxRate > 0);
    return transaction ? transaction.fxRate : null;
  }

  function nativeAmount(transaction, account) {
    const txCurrency = String(transaction.currency || "JPY").toUpperCase();
    if (txCurrency === account.currency) return transaction.amount;
    if (account.currency === "JPY") return jpyAmount(transaction);
    const rate = latestFxRate(account.currency);
    return rate ? jpyAmount(transaction) / rate : transaction.amount;
  }

  function moveOut(account, amount) {
    account.balance += isCreditAccount(account) ? amount : -amount;
  }

  function moveIn(account, amount) {
    account.balance += isCreditAccount(account) ? -amount : amount;
  }

  function accountBalances() {
    const accounts = state.accounts.map((account) => ({ ...account, balance: account.openingBalance }));
    const byName = new Map(accounts.map((account) => [account.name, account]));

    [...state.transactions].reverse().forEach((transaction) => {
      const from = byName.get(String(transaction.account || "").trim());
      const to = byName.get(String(transaction.toAccount || "").trim());
      const type = normalizedType(transaction.type);

      if (type === "expense" && from) {
        moveOut(from, nativeAmount(transaction, from));
      } else if (type === "income" && from) {
        moveIn(from, nativeAmount(transaction, from));
      } else if (type === "transfer") {
        if (from) moveOut(from, nativeAmount(transaction, from));
        if (to) moveIn(to, nativeAmount(transaction, to));
      } else if (["record payment", "payment", "credit card payment"].includes(type)) {
        if (from && to && isCreditAccount(from) && !isCreditAccount(to)) {
          moveOut(to, nativeAmount(transaction, to));
          moveIn(from, nativeAmount(transaction, from));
        } else {
          if (from) moveOut(from, nativeAmount(transaction, from));
          if (to) moveIn(to, nativeAmount(transaction, to));
        }
      }
    });

    return accounts;
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

      const value = document.createElement("dd");
      const balance = document.createElement("span");
      balance.className = "account-balance";
      balance.textContent = formatNative(account.balance, account.currency);
      value.appendChild(balance);

      if (account.currency === "CNY") {
        const conversion = document.createElement("span");
        conversion.className = "account-conversion";
        const rate = latestFxRate("CNY");
        conversion.textContent = rate ? `${formatJPY(account.balance * rate)} · ¥${rate.toFixed(2)}/CN¥` : "JPY rate unavailable";
        value.appendChild(conversion);
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

    const rate = latestFxRate("CNY");
    els.accountsCaption.textContent = rate ? `Current balances · CNY at ¥${rate.toFixed(2)}` : "Current balances";
  }

  function transactionTitle(transaction) {
    return String(transaction.merchant || transaction.category || transaction.type || "Transaction").trim();
  }

  function transactionAmountPrefix(transaction) {
    if (isType(transaction, "income")) return "+";
    if (isType(transaction, "expense")) return "−";
    return "";
  }

  function renderRecent(summary) {
    els.recentList.replaceChildren();
    const recent = summary.transactions.slice(0, 10);
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
      date.append(month, day);

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

  function renderPeriod() {
    const summary = periodSummary();
    renderOverview(summary);
    renderCategories(summary);
    renderRecent(summary);
  }

  function setNotice(message) {
    els.notice.hidden = false;
    els.noticeCopy.textContent = message;
  }

  function bindPeriodControls() {
    document.querySelectorAll(".period-button").forEach((button) => {
      button.addEventListener("click", () => {
        state.period = button.dataset.period;
        document.querySelectorAll(".period-button").forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle("is-active", active);
          candidate.setAttribute("aria-pressed", String(active));
        });
        renderPeriod();
      });
    });
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

    if (!rawFragment) {
      setNotice("Open this page from your iPhone Shortcut to load the latest ledger.");
    } else if (!payload.ledgerText && !payload.accountsText) {
      setNotice("The private data fragment could not be read. Rebuild the Shortcut using the included guide.");
    } else if (state.skippedLines > 0) {
      setNotice(`Loaded locally. ${state.skippedLines} malformed ledger ${state.skippedLines === 1 ? "line was" : "lines were"} skipped.`);
    }

    bindPeriodControls();
    renderPeriod();
    renderTrend();
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
