declare module "africastalking" {
  interface ATConfig { apiKey: string; username: string; }
  interface SMSOptions { to: string[]; message: string; from?: string; }
  interface SMSService { send(options: SMSOptions): Promise<unknown>; }
  interface ATInstance { SMS: SMSService; }
  function AfricasTalking(config: ATConfig): ATInstance;
  export default AfricasTalking;
}
