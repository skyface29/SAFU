// Яндекс Карты: адрес пары, маршрут
export const mapsURL = (address: string, city = 'Архангельск') =>
  `https://yandex.ru/maps/?text=${encodeURIComponent(`${city}, ${address.replace(/\(.*?\)/g, '').trim()}`)}`
export const routeURL = (address: string, city = 'Архангельск') =>
  `https://yandex.ru/maps/?rtext=~${encodeURIComponent(`${city}, ${address.replace(/\(.*?\)/g, '').trim()}`)}&rtt=auto`
