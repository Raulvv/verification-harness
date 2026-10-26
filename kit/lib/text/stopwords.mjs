// The kit's stopword vocabularies — ONE home (RN-K05).
//
// There are two DISTINCT sets on purpose; they are different behaviours, not a
// duplicate to merge. Merging them changes selection and the measured battery:
//   - WINDOW_STOP: the content-word filter shared by the window snippet scorer
//     (`answer/window.mjs`), the dense question weights (`answer/dense.mjs`)
//     and the locate phrase scorer (`corpus/locate.mjs`).
//   - TERM_STOP: the retriever term filter (`corpus/terms.mjs`).
export const WINDOW_STOP = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'do', 'does', 'how', 'is',
  'are', 'was', 'were', 'and', 'or', 'it', 'its', 'you', 'your', 'that',
  'this', 'with', 'from', 'be', 'can', 'will', 'by', 'at', 'as', 'when',
  'what', 'which', 'who',
])

export const TERM_STOP = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'what', 'when', 'where', 'which',
  'who', 'whom', 'how', 'does', 'did', 'not', 'with', 'from', 'that', 'this',
  'these', 'those', 'into', 'than', 'then', 'them', 'they', 'you', 'your',
  'can', 'could', 'would', 'should', 'have', 'has', 'had', 'about', 'over',
  'under', 'its', 'his', 'her', 'their', 'ours', 'yours', 'onto', 'per', 'out',
  'get', 'got', 'use', 'used', 'using', 'make', 'made', 'tell', 'show', 'many',
  'much', 'any', 'all', 'one', 'two', 'three',
])
