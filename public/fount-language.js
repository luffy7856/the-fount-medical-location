/* THE FOUNT: shared public-copy localization layer. */
(() => {
  const script = document.currentScript;
  if (!script) return;

  const supported = new Set(["ko", "en", "ja"]);
  const cookieName = "fount_language";
  const dictionaryBase = new URL("i18n/", script.src);
  const revision = new URL(script.src).searchParams.get("v");
  function dictionaryUrl(name) {
    const url = new URL(name, dictionaryBase);
    if (revision) url.searchParams.set("v", revision);
    return url;
  }
  const originalText = new WeakMap();
  const originalNumeric = new WeakMap();
  const originalAttributes = new WeakMap();
  const korean = /[가-힣]/;
  const skip = "script, style, noscript, code, pre, [contenteditable], [data-no-translate]";
  const skipText = `${skip}, input, textarea`;
  let dictionary = {};
  let language = "ko";
  let observer;
  let busy = false;
  let requestId = 0;

  function readCookie() {
    const value = document.cookie.split("; ").find((part) => part.startsWith(`${cookieName}=`));
    return value ? decodeURIComponent(value.split("=")[1]) : "";
  }

  function preferredLanguage() {
    const query = new URLSearchParams(location.search).get("lang");
    let stored = readCookie();
    try { stored ||= localStorage.getItem(cookieName); } catch (_) { /* Private mode. */ }
    return supported.has(query) ? query : supported.has(stored) ? stored : "ko";
  }

  function saveLanguage(next) {
    try { localStorage.setItem(cookieName, next); } catch (_) { /* Private mode. */ }
    const domain = /(^|\.)thefount\.co\.kr$/.test(location.hostname) ? "; Domain=.thefount.co.kr" : "";
    document.cookie = `${cookieName}=${next}; Path=/; SameSite=Lax; Max-Age=31536000${domain}`;
  }

  function translate(value) {
    const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(value);
    if (!match) return value;
    const normalized = match[2].replace(/\s+/g, " ").trim();
    return `${match[1]}${dictionary[match[2]] || dictionary[normalized] || translateClinicResult(match[2]) || translateMarketingResult(match[2]) || translateCurrency(match[2]) || translateCount(match[2]) || match[2]}${match[3]}`;
  }

  function translateCurrency(value) {
    if (language === "ko") return "";
    if (value.trim() === "원") return language === "en" ? "won" : "ウォン";
    const won = /^([\d,]+)\s*원$/.exec(value.trim());
    if (won) return language === "en" ? `KRW ${won[1]}` : `${won[1]}ウォン`;
    const match = /^([\d,]+(?:\.\d+)?)\s*(만|억)(?:\s*원)?$/.exec(value.trim());
    if (!match) return "";
    const amount = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(amount)) return "";
    if (language === "ja") return `${match[1]}${match[2] === "억" ? "億" : "万"}ウォン`;
    return `KRW ${(amount * (match[2] === "억" ? 100000000 : 10000)).toLocaleString("en-US")}`;
  }

  function translateCount(value) {
    if (language === "ko") return "";
    const match = /^([\d,]+)\s*(건|명|개월|년|평)$/.exec(value.trim());
    if (!match) return "";
    const units = language === "en"
      ? { "건": "cases", "명": "people", "개월": "months", "년": "years", "평": "pyeong" }
      : { "건": "件", "명": "人", "개월": "か月", "년": "年", "평": "坪" };
    return language === "en" ? `${match[1]} ${units[match[2]]}` : `${match[1]}${units[match[2]]}`;
  }

  function translateMarketingResult(value) {
    if (language === "ko" || !dictionary["네이버 플레이스"]) return "";
    const label = (source) => dictionary[source] || source;
    let match = /^기본적인 온라인 접점은 있으나 (.+)이 환자 유입의 가장 큰 병목이 될 수 있습니다\.$/.exec(value);
    if (match) return language === "en"
      ? `Basic online touchpoints exist, but ${label(match[1])} may be the biggest obstacle to patient acquisition.`
      : `基本的なオンライン接点はありますが、${label(match[1])}が患者流入の最大の課題となる可能性があります。`;
    match = /^(.+) 기반은 잘 갖춰져 있지만 (.+)에서 추가 개선 여지가 있습니다\.$/.exec(value);
    if (match) return language === "en"
      ? `${label(match[1])} is relatively strong, but ${label(match[2])} has room for improvement.`
      : `${label(match[1])}の基盤は比較的整っていますが、${label(match[2])}には改善の余地があります。`;
    match = /^(.+) 기반이 비교적 잘 갖춰져 있습니다$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `${label(match[1])} has a relatively strong foundation`
      : `${label(match[1])}の基盤は比較的整っています`;
    match = /^현재 시뮬레이션 점수는 (\d+)점입니다\.$/.exec(value);
    if (match) return language === "en"
      ? `Current simulation score: ${match[1]} points.`
      : `現在のシミュレーションスコアは${match[1]}点です。`;
    match = /^(.+) 현재 시뮬레이션 점수는 (\d+)점입니다\.$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `${label(match[1])} Current simulation score: ${match[2]} points.`
      : `${label(match[1])} 現在のシミュレーションスコアは${match[2]}点です。`;
    match = /^(.+) 영역은 현재 입력 정보 기준 상대적인 강점으로 확인됩니다\.$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `${label(match[1])} is a relative strength based on the information entered.`
      : `入力された情報に基づくと、${label(match[1])}は相対的な強みです。`;
    match = /^현재 수준을 유지하면서 (.+)$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `Maintain the current standard. ${label(match[1])}`
      : `現在の水準を維持してください。${label(match[1])}`;
    match = /^(.+)은\(는\) (.+)이 상대적인 강점이며, (.+)은 먼저 점검할 영역입니다\.$/.exec(value);
    if (match) return language === "en"
      ? `${match[1]} is relatively strong in ${label(match[2])}; review ${label(match[3])} first.`
      : `${match[1]}は${label(match[2])}が相対的な強みで、${label(match[3])}を先に確認する必要があります。`;
    match = /^(.+) 단계에서 환자가 다음 행동으로 이동하지 못할 가능성이 가장 큽니다\.$/.exec(value);
    if (match) return language === "en"
      ? `Patients are most likely to drop off at the ${label(match[1])} stage.`
      : `${label(match[1])}の段階で患者が次の行動に進まない可能性が最も高くなっています。`;
    match = /^(.+)의 온라인 마케팅은 ‘발견’보다 ‘신뢰와 행동’의 연결을 더 세밀하게 관리할 필요가 있습니다\.$/.exec(value);
    if (match) return language === "en"
      ? `${match[1]} should manage the connection from discovery to trust and action more carefully.`
      : `${match[1]}では、発見から信頼・行動へつながる流れをより丁寧に管理する必要があります。`;
    match = /^(\d+)개 이름 조합으로도 공식 채널을 확정하지 못했습니다\.$/.exec(value);
    if (match) return language === "en"
      ? `Could not confirm an official channel after checking ${match[1]} name variations.`
      : `${match[1]}種類の名称で検索しても公式チャネルを確認できませんでした。`;
    match = /^(.+)에서 (.+)를 검색한 환자가 병원명과 공식 채널을 빠르게 구분할 수 있어야 합니다\. 검색 결과와 플레이스의 병원명·진료 표현이 일치하는지 확인합니다\.$/.exec(value);
    if (match) return language === "en"
      ? `Patients searching for ${label(match[2])} in ${match[1]} should be able to identify the practice and its official channels quickly. Check that the practice name and care descriptions agree across search results and Place listings.`
      : `${match[1]}で${label(match[2])}を検索する患者が、医療機関名と公式チャネルをすぐに区別できるようにしましょう。検索結果と地図掲載で名称と診療内容の表現が一致しているか確認してください。`;
    match = /^(.+)에서 (.+)를 찾는 환자가 병원을 발견하기 전에 다른 병원으로 이동할 가능성이 있습니다\. 홈페이지 제목·플레이스·블로그의 병원명과 대표 진료 표현부터 통일할 필요가 있습니다\.$/.exec(value);
    if (match) return language === "en"
      ? `Patients searching for ${label(match[2])} in ${match[1]} may move to another practice before finding this one. Align the practice name and key care descriptions across the website, Place listing and blog.`
      : `${match[1]}で${label(match[2])}を探す患者が、この医療機関を見つける前にほかへ移る可能性があります。公式サイト、地図掲載、ブログで名称と主な診療内容の表現を統一しましょう。`;
    match = /^(.+)에서 (.+)를 찾는 환자가 병원 공식 채널을 발견할 기본 조건은 비교적 잘 갖춰진 편입니다\. 이제 병원명 검색뿐 아니라 지역명·주요 진료명 검색에서도 같은 설명과 브랜드가 이어지는지 확인하면 좋습니다\.$/.exec(value);
    if (match) return language === "en"
      ? `The basic conditions for patients seeking ${label(match[2])} in ${match[1]} to find official channels are relatively strong. Check that the same description and branding appear in area and service searches as well as name searches.`
      : `${match[1]}で${label(match[2])}を探す患者が公式チャネルを見つける基本条件は比較的整っています。名称だけでなく地域名や主な診療内容での検索でも、説明とブランドが一貫しているか確認しましょう。`;
    match = /^병원명 검색의 기본 노출은 기대할 수 있지만, (.+)과 (.+)를 함께 검색하는 신규 환자에게는 공식 채널이 충분히 선명하지 않을 수 있습니다\. 채널별 병원명과 대표 진료 표현을 하나로 맞추는 작업이 먼저입니다\.$/.exec(value);
    if (match) return language === "en"
      ? `The practice may appear in name searches, but official channels may be less clear to new patients searching for ${match[1]} and ${label(match[2])} together. First, align the practice name and key care descriptions across channels.`
      : `医療機関名での検索には表示されても、${match[1]}と${label(match[2])}を組み合わせて探す新規患者には公式チャネルが分かりにくい可能性があります。まず名称と主な診療内容の表現を統一しましょう。`;
    match = /^30일 안에는 (.+)$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `Within 30 days: ${label(match[1])}`
      : `30日以内に：${label(match[1])}`;
    match = /^3개월 동안 (.+) 이후 변화된 점수와 상담 흐름을 다시 비교해보세요\.$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `Over the next three months: ${label(match[1])} Then compare the score and consultation flow again.`
      : `今後3か月で：${label(match[1])} その後、スコアと相談までの流れを再度比較してください。`;
    return "";
  }

  function translateClinicResult(value) {
    if (language === "ko") return "";
    let match = /^현재 병원은 (.+) 영역이 상대적으로 안정적으로 관리되고 있습니다\.$/.exec(value);
    if (match) {
      const parts = match[1].split("과 ").map((part) => dictionary[part] || part);
      const labels = parts.join(language === "en" ? " and " : "と");
      return language === "en"
        ? `${labels} are relatively well managed in this practice.`
        : `現在、${labels}の分野は比較的安定して管理されています。`;
    }
    match = /^다만 (.+)와 (.+) 영역은 다른 항목보다 점수가 낮아 먼저 확인할 필요가 있습니다\. 특히 (.+)을 실제 숫자로 확인하면 지금 무엇부터 바꿔야 하는지 더 명확해집니다\.$/.exec(value);
    if (match) {
      const first = dictionary[match[1]] || match[1];
      const second = dictionary[match[2]] || match[2];
      const measure = dictionary[match[3]] || match[3];
      return language === "en"
        ? `${first} and ${second} scored lower than other areas and should be reviewed first. Measuring ${measure} with actual figures will clarify what to change next.`
        : `ただし、${first}と${second}はほかの分野より点数が低く、先に確認が必要です。特に${measure}を実際の数値で確認すると、次に何を変えるべきか明確になります。`;
    }
    match = /^(\d+)점$/.exec(value);
    if (match) return language === "en" ? `${match[1]} points` : `${match[1]}点`;
    match = /^(.+) (\d+)점$/.exec(value);
    if (match && dictionary[match[1]]) return language === "en"
      ? `${dictionary[match[1]]} ${match[2]} points`
      : `${dictionary[match[1]]} ${match[2]}点`;
    const parts = value.split(" · ");
    if (parts.length === 3 && parts.some((part) => dictionary[part])) {
      return parts.map((part) => dictionary[part] || part).join(" · ");
    }
    return "";
  }

  function updateText(node) {
    if (node.parentElement?.closest(skipText)) return;
    const option = node.parentElement?.closest("option");
    if (option && !option.hasAttribute("value")) option.setAttribute("value", option.textContent || "");
    const current = node.nodeValue || "";
    let source = originalText.get(node);
    if (korean.test(current) && (!source || (current !== source && current !== translate(source)))) {
      source = current;
      originalText.set(node, source);
    }
    if (source && originalText.has(node)) {
      const multiplier = { "원": 1, "만원": 10000, "만 원": 10000, "억": 100000000, "억원": 100000000, "억 원": 100000000 }[source.trim()];
      let previous = node.previousSibling;
      while (previous && (previous.nodeType === Node.COMMENT_NODE || previous.nodeType === Node.TEXT_NODE && !(previous.nodeValue || "").trim())) previous = previous.previousSibling;
      if (multiplier && previous?.nodeType === Node.TEXT_NODE) {
        const visibleNumber = (previous.nodeValue || "").trim();
        if (/^[\d,]+(?:\.\d+)?$/.test(visibleNumber)) originalNumeric.set(previous, visibleNumber);
        const rawNumber = originalNumeric.get(previous);
        if (rawNumber) {
          const amount = Number(rawNumber.replaceAll(",", "")) * multiplier;
          if (Number.isFinite(amount)) {
            const nextNumber = language === "en" ? `KRW ${amount.toLocaleString("en-US")}` : rawNumber;
            const nextSuffix = language === "en" ? "" : language === "ko" ? source : translate(source);
            if (previous.nodeValue !== nextNumber) previous.nodeValue = nextNumber;
            if (current !== nextSuffix) node.nodeValue = nextSuffix;
            return;
          }
        }
      }
      const next = language === "ko" ? source : translate(source);
      if (current !== next) node.nodeValue = next;
    }
  }

  function updateAttributes(element) {
    if (element.hasAttribute("data-fount-currency")) {
      const amount = Number(element.getAttribute("data-fount-currency"));
      if (Number.isFinite(amount)) {
        const next = language === "en" ? `KRW ${amount.toLocaleString("en-US")}`
          : language === "ja" ? `${(amount / 10000).toLocaleString("ja-JP")}万ウォン`
            : `${(amount / 10000).toLocaleString("ko-KR")}만`;
        if (element.textContent !== next) element.textContent = next;
      }
      return;
    }
    if (element.closest(skip)) return;
    let sources = originalAttributes.get(element);
    if (!sources) { sources = {}; originalAttributes.set(element, sources); }
    for (const name of ["placeholder", "title", "aria-label", "alt"]) {
      const current = element.getAttribute(name);
      if (!current) continue;
      if (!sources[name] || (current !== sources[name] && current !== translate(sources[name]))) {
        if (korean.test(current)) sources[name] = current;
      }
      if (!sources[name]) continue;
      const next = language === "ko" ? sources[name] : translate(sources[name]);
      if (current !== next) element.setAttribute(name, next);
    }
  }

  function walk(root) {
    if (root.nodeType === Node.TEXT_NODE) { updateText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(skip)) return;
    updateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) updateText(node);
      else updateAttributes(node);
    }
  }

  function apply() {
    if (busy) return;
    busy = true;
    document.documentElement.lang = language;
    walk(document.body);
    document.title = language === "ko" ? (document.documentElement.dataset.originalTitle || document.title) : translate(document.documentElement.dataset.originalTitle || document.title);
    busy = false;
  }

  async function setLanguage(next, updateUrl) {
    if (!supported.has(next)) return;
    if (language === "ko") document.documentElement.dataset.originalTitle = document.title;
    const currentRequest = ++requestId;
    language = next;
    saveLanguage(next);
    if (updateUrl) {
      const url = new URL(location.href);
      if (next === "ko") url.searchParams.delete("lang");
      else url.searchParams.set("lang", next);
      history.replaceState(history.state, "", url);
    }
    if (next === "ko") dictionary = {};
    else {
      try {
        const response = await fetch(dictionaryUrl(`${next}.json`));
        if (!response.ok) throw new Error(`Translation file HTTP ${response.status}`);
        const loaded = await response.json();
        let common = {};
        if (script.dataset.common === "true") {
          const commonResponse = await fetch(dictionaryUrl(`common-${next}.json`));
          if (!commonResponse.ok) throw new Error(`Common language file HTTP ${commonResponse.status}`);
          common = await commonResponse.json();
        }
        if (currentRequest !== requestId) return;
        dictionary = { ...common, ...loaded };
      } catch (error) {
        if (currentRequest !== requestId) return;
        console.error("THE FOUNT language file is unavailable:", error);
        dictionary = {};
      }
    }
    apply();
    const select = document.getElementById("fount-language-select");
    if (select) select.value = next;
    document.dispatchEvent(new CustomEvent("fount-language-change", { detail: { language: next } }));
  }

  function addSelector() {
    if (document.getElementById("fount-language-select")) return;
    const style = document.createElement("style");
    style.textContent = ".fount-language-control{display:inline-flex;align-items:center;gap:6px;flex:none;margin-left:4px;font:500 12px/1.2 Arial,sans-serif;color:inherit;z-index:20}.fount-language-control select{max-width:105px;padding:7px 22px 7px 9px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}.fount-language-control option{color:#14243c;background:#fff}.siteHeader.fount-i18n-active .headerInner{gap:18px}.siteHeader.fount-i18n-active nav{gap:18px}.siteHeader.fount-i18n-active nav>a{font-size:12px}@media(max-width:1260px){.fount-language-caption{display:none}}@media(max-width:760px){.fount-language-control{margin-left:4px}.fount-language-control select{max-width:82px;padding:6px 2px;font-size:11px}}";
    document.head.append(style);
    const header = document.querySelector("header .headerInner, header .header-inner, header .container") ||
      document.querySelector(".question-top, .result-mast, .navInner") || document.querySelector("header, nav.nav") || document.body;
    header.closest("header")?.classList.add("fount-i18n-active");
    const wrapper = document.createElement("label");
    wrapper.className = "fount-language-control";
    wrapper.setAttribute("data-no-translate", "");
    const caption = document.createElement("span");
    caption.className = "fount-language-caption";
    caption.textContent = "Language";
    const select = document.createElement("select");
    select.id = "fount-language-select";
    select.setAttribute("aria-label", "Select language / 언어 선택 / 言語を選択");
    for (const [code, label] of [["ko", "한국어"], ["en", "English"], ["ja", "日本語"]]) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = label;
      select.append(option);
    }
    select.value = language;
    select.addEventListener("change", () => setLanguage(select.value, true));
    wrapper.append(caption, select);
    header.append(wrapper);
  }

  function isInternalLink(url) {
    const host = url.hostname.toLowerCase();
    return host === location.hostname || host === "www.thefount.co.kr" || host.endsWith(".thefount.co.kr") ||
      host.endsWith(".vercel.app") && /fount|finance|payroll|nextbridge/.test(host);
  }

  document.addEventListener("click", (event) => {
    if (language === "ko" || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor || anchor.download || anchor.target === "_blank") return;
    const url = new URL(anchor.href, location.href);
    if (!/^https?:$/.test(url.protocol) || !isInternalLink(url)) return;
    url.searchParams.set("lang", language);
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(url.href);
  }, true);

  document.documentElement.dataset.originalTitle = document.title;
  language = preferredLanguage();
  addSelector();
  setLanguage(language, false);
  observer = new MutationObserver((mutations) => {
    if (busy) return;
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const currency = mutation.target.parentElement?.closest("[data-fount-currency]");
        if (currency) updateAttributes(currency);
        else {
          walk(mutation.target);
          let suffix = mutation.target.nextSibling;
          while (suffix && (suffix.nodeType === Node.COMMENT_NODE || (suffix.nodeType === Node.TEXT_NODE && !suffix.nodeValue?.trim()))) suffix = suffix.nextSibling;
          if (suffix?.nodeType === Node.TEXT_NODE && originalText.get(suffix)?.trim() in { "원": 1, "만원": 1, "만 원": 1, "억": 1, "억원": 1, "억 원": 1 }) updateText(suffix);
        }
      }
      else if (mutation.type === "attributes") updateAttributes(mutation.target);
      else for (const node of mutation.addedNodes) {
        const currency = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement)?.closest("[data-fount-currency]");
        if (currency) updateAttributes(currency);
        else walk(node);
      }
    }
    if (!document.getElementById("fount-language-select")) addSelector();
  });
  observer.observe(document.body, { childList: true, characterData: true, attributes: true, subtree: true, attributeFilter: ["placeholder", "title", "aria-label", "alt"] });
  const titleObserver = new MutationObserver(() => {
    if (busy || language === "ko") return;
    const original = document.documentElement.dataset.originalTitle || "";
    const expected = translate(original);
    if (document.title === expected) return;
    if (korean.test(document.title)) document.documentElement.dataset.originalTitle = document.title;
    const localized = translate(document.documentElement.dataset.originalTitle || document.title);
    if (document.title !== localized) document.title = localized;
  });
  titleObserver.observe(document.head, { childList: true, characterData: true, subtree: true });
})();
