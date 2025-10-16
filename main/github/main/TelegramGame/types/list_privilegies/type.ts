export interface ITelegramGamePrivilegiesList {
  level: number;
  prefix: string;
  amount_players: number[]
  rows: any[]
}

export interface ITelegramGamePrivilegiesCommand {
  level: number;
  command: string;
  action: string;
  rows: any[]
}