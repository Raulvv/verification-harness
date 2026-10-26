// Light morphology + identifier splitting — ONE home (RN-K05). These are four
// distinct transforms used by different selectors; co-locating them means a
// fix lands in one place, not three. Each keeps its exact previous behaviour:
//   - stem:      the window/dense light stemmer ("codes" -> "code").
//   - rootTerm:  the locate stemmer ("logging"/"logger" -> "logg"; "created"
//                -> "creat"), capped at 5 chars, falling back to the input.
//   - splitId:   camelCase/identifier boundaries ("ContentTypeParser" ->
//                "Content Type Parser").
//   - splitWords: splitId + separators + lowercase (the locate index form).
export const stem = (w) => w.replace(/ies$/, 'y').replace(/s$/, '')

export const rootTerm = (t) => {
  const r = t.replace(/(ing|ed|es|s|er|ly)$/i, '')
  return (r.length >= 3 ? r : t).slice(0, 5)
}

export const splitId = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')

export const splitWords = (s) =>
  String(s ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .toLowerCase()
