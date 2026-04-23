export interface TelegramInternetConnectionEventDTO {
  type: 'TELEGRAM_MESSAGE',
  chatId: string,
  text: string,
}

export type InternetConnectionEventDTO =
  | TelegramInternetConnectionEventDTO;
