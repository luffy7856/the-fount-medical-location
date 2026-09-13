# Report fonts

Noto Sans KR is distributed under the SIL Open Font License (see NotoSansKR-LICENSE.txt).

NotoSansKR-700.ttf was instantiated at weight 700 from the official Google Fonts NotoSansKR[wght].ttf and statically subset to Latin, Hangul syllables/jamo, punctuation and symbols for Korean reports. Source: https://github.com/google/fonts/tree/main/ofl/notosanskr

Both report fonts are embedded with runtime subsetting disabled because pdf-lib/fontkit runtime subsetting caused missing Korean glyphs. The static bold subset keeps generated reports within hosting response limits.

NotoSansKR-report-400.ttf is a static subset of the existing regular font. It preserves Hangul, CJK ideographs, kana, Latin and common symbols (U+0020-00FF, U+1100-11FF, U+2000-26FF, U+3000-9FFF, U+AC00-D7A3), while removing unused variants. The original site font remains unchanged.
