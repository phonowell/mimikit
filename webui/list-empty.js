export const renderEmptyListState = (list, itemClass, text) => {
  if (!list) return
  list.innerHTML = ''
  const empty = document.createElement('li')
  if (typeof itemClass === 'string' && itemClass.trim()) empty.className = itemClass
  const article = document.createElement('article')
  article.textContent = typeof text === 'string' ? text : ''
  empty.appendChild(article)
  list.appendChild(empty)
}
