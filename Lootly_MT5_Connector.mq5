//+------------------------------------------------------------------+
//|                                     Lootly_MT5_Connector.mq5     |
//|                        Copyright 2026, Lootly Trading Journal    |
//|                                    https://lootly-mu.vercel.app  |
//+------------------------------------------------------------------+
#property copyright   "Copyright 2026, Lootly Trading Journal"
#property link        "https://lootly-mu.vercel.app"
#property version     "1.00"
#property description "Lootly Read-Only MT5 Direct Connector for Valetax & MetaTrader 5"
#property description "Automatically synchronizes mobile & desktop trading activity to Lootly Cloud"
#property strict

//--- Input Parameters
input group "=== LOOTLY CLOUD SETTINGS ==="
input string   InpLootlyUrl                = "https://lootly-mu.vercel.app/api/mt5/webhook"; // Lootly Webhook URL
input string   InpConnectorToken          = "";                                             // Connector Secret Token (from Lootly Settings)

input group "=== SYNCHRONIZATION SETTINGS ==="
input int      InpSyncIntervalSeconds      = 5;       // Event Queue Flush Interval (seconds)
input int      InpHeartbeatIntervalSeconds = 30;      // Heartbeat & Snapshot Interval (seconds)
input int      InpReconcileIntervalMinutes = 5;       // Full Reconciliation Interval (minutes)
input int      InpMaxBatchSize             = 50;      // Max Events Per WebRequest Batch
input bool     InpVerboseLog               = false;   // Verbose Terminal Logging

//--- Event Structure for Lightweight Local Queue
struct TradeEvent
{
   string   id;          // Unique deduplication ID
   string   eventType;   // position_open, position_modify, deal, etc.
   datetime timestamp;
   string   jsonData;    // Serialized event payload
};

//--- Global Queue & State Buffers
TradeEvent g_eventQueue[];
int        g_queueSize = 0;
datetime   g_lastHeartbeat = 0;
datetime   g_lastReconcile = 0;
datetime   g_lastHistoryScan = 0;
bool       g_isInitialized = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("=====================================================");
   Print("[Lootly MT5] Initializing Lootly Read-Only Connector v1.00");
   Print("[Lootly MT5] Broker: ", AccountInfoString(ACCOUNT_COMPANY));
   Print("[Lootly MT5] Server: ", AccountInfoString(ACCOUNT_SERVER));
   Print("[Lootly MT5] Account Login: ", AccountInfoInteger(ACCOUNT_LOGIN));
   Print("[Lootly MT5] Currency: ", AccountInfoString(ACCOUNT_CURRENCY));
   Print("=====================================================");

   if(StringLen(InpConnectorToken) == 0)
   {
      Alert("[Lootly MT5 Error] InpConnectorToken is empty! Please generate a token from Lootly Settings.");
      Print("[Lootly MT5 Error] EA halted: InpConnectorToken is required.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   // Initialize Timer at 1-second ticks for smooth event queue flushing
   EventSetTimer(1);

   ArrayResize(g_eventQueue, 0);
   g_queueSize = 0;
   g_lastHeartbeat = 0;
   g_lastReconcile = 0;
   g_lastHistoryScan = TimeCurrent() - (7 * 86400); // Scan past 7 days on start

   // Perform initial immediate reconciliation
   TriggerFullReconciliation();

   g_isInitialized = true;
   Print("[Lootly MT5] Initialization completed successfully.");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("[Lootly MT5] Deinitialized. Reason code: ", reason);
}

//+------------------------------------------------------------------+
//| Expert Trade Transaction Event Handler                           |
//| Catches all mobile and desktop order/position/deal executions    |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeOrder& order,
                        const MqlTradeDeal& deal)
{
   if(!g_isInitialized) return;

   // Enqueue lightweight event without executing network calls directly
   switch(trans.type)
   {
      case TRADE_TRANSACTION_DEAL_ADD:
      {
         EnqueueDealEvent(trans.deal);
         break;
      }
      case TRADE_TRANSACTION_POSITION:
      {
         EnqueuePositionEvent(trans.position);
         break;
      }
      case TRADE_TRANSACTION_ORDER_ADD:
      case TRADE_TRANSACTION_ORDER_UPDATE:
      case TRADE_TRANSACTION_ORDER_DELETE:
      {
         // Order state changes captured for reconciliation
         if(InpVerboseLog)
         {
            Print("[Lootly MT5] Order event detected: ticket #", trans.order);
         }
         break;
      }
      case TRADE_TRANSACTION_HISTORY_ADD:
      {
         // Historical deal confirmed
         EnqueueDealEvent(trans.deal);
         break;
      }
      default:
         break;
   }
}

//+------------------------------------------------------------------+
//| Timer Event Handler: Batches and flushes queued sync events      |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();

   // 1. Flush Event Queue if due
   static datetime lastQueueFlush = 0;
   if(now - lastQueueFlush >= InpSyncIntervalSeconds && g_queueSize > 0)
   {
      FlushEventQueue();
      lastQueueFlush = now;
   }

   // 2. Periodic Heartbeat & Snapshot
   if(now - g_lastHeartbeat >= InpHeartbeatIntervalSeconds)
   {
      SendHeartbeatSnapshot();
      g_lastHeartbeat = now;
   }

   // 3. Periodic Full Position Reconciliation (failsafe for connection drops)
   if(now - g_lastReconcile >= (InpReconcileIntervalMinutes * 60))
   {
      TriggerFullReconciliation();
      g_lastReconcile = now;
   }
}

//+------------------------------------------------------------------+
//| Enqueue Deal Event into local buffer                             |
//+------------------------------------------------------------------+
void EnqueueDealEvent(ulong dealTicket)
{
   if(dealTicket <= 0) return;
   if(!HistoryDealSelect(dealTicket)) return;

   string eventId = "deal_" + IntegerToString(dealTicket);
   if(IsEventInQueue(eventId)) return;

   string json = FormatDealJson(dealTicket);
   AddEventToQueue(eventId, "deal", json);

   if(InpVerboseLog)
   {
      Print("[Lootly MT5] Deal enqueued: #", dealTicket);
   }
}

//+------------------------------------------------------------------+
//| Enqueue Position Event into local buffer                         |
//+------------------------------------------------------------------+
void EnqueuePositionEvent(ulong positionTicket)
{
   if(positionTicket <= 0) return;

   string eventId = "pos_" + IntegerToString(positionTicket) + "_" + IntegerToString((long)TimeCurrent());
   if(IsEventInQueue(eventId)) return;

   string json = FormatPositionJson(positionTicket);
   AddEventToQueue(eventId, "position_update", json);

   if(InpVerboseLog)
   {
      Print("[Lootly MT5] Position update enqueued: #", positionTicket);
   }
}

//+------------------------------------------------------------------+
//| Helper: Check if event is already in the queue                   |
//+------------------------------------------------------------------+
bool IsEventInQueue(string eventId)
{
   for(int i = 0; i < g_queueSize; i++)
   {
      if(g_eventQueue[i].id == eventId) return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Helper: Add event to dynamic queue array                         |
//+------------------------------------------------------------------+
void AddEventToQueue(string eventId, string eventType, string jsonData)
{
   g_queueSize++;
   ArrayResize(g_eventQueue, g_queueSize);
   g_eventQueue[g_queueSize - 1].id = eventId;
   g_eventQueue[g_queueSize - 1].eventType = eventType;
   g_eventQueue[g_queueSize - 1].timestamp = TimeCurrent();
   g_eventQueue[g_queueSize - 1].jsonData = jsonData;
}

//+------------------------------------------------------------------+
//| Flush queued events via WebRequest to Lootly API                 |
//+------------------------------------------------------------------+
void FlushEventQueue()
{
   if(g_queueSize == 0) return;

   int countToSend = MathMin(g_queueSize, InpMaxBatchSize);

   // Build JSON events array
   string eventsJson = "[";
   for(int i = 0; i < countToSend; i++)
   {
      if(i > 0) eventsJson += ",";
      eventsJson += "{\"id\":\"" + g_eventQueue[i].id + "\",";
      eventsJson += "\"type\":\"" + g_eventQueue[i].eventType + "\",";
      eventsJson += "\"timestamp\":" + IntegerToString((long)g_eventQueue[i].timestamp) + ",";
      eventsJson += "\"data\":" + g_eventQueue[i].jsonData + "}";
   }
   eventsJson += "]";

   string payload = BuildFullPayload(eventsJson, BuildPositionsJson(), BuildRecentDealsJson());

   bool success = SendLootlyPayload(payload);
   if(success)
   {
      // Shift remaining events forward
      int remaining = g_queueSize - countToSend;
      if(remaining > 0)
      {
         for(int i = 0; i < remaining; i++)
         {
            g_eventQueue[i] = g_eventQueue[i + countToSend];
         }
         ArrayResize(g_eventQueue, remaining);
         g_queueSize = remaining;
      }
      else
      {
         ArrayResize(g_eventQueue, 0);
         g_queueSize = 0;
      }

      if(InpVerboseLog)
      {
         Print("[Lootly MT5] Successfully synchronized ", countToSend, " events to Lootly Cloud.");
      }
   }
   else
   {
      Print("[Lootly MT5 Warning] Failed to flush events. Kept in buffer for retry.");
   }
}

//+------------------------------------------------------------------+
//| Send Heartbeat & Account Snapshot                                |
//+------------------------------------------------------------------+
void SendHeartbeatSnapshot()
{
   string payload = BuildFullPayload("[]", BuildPositionsJson(), "[]");
   SendLootlyPayload(payload);
}

//+------------------------------------------------------------------+
//| Trigger Full Position & Deal Reconciliation                      |
//+------------------------------------------------------------------+
void TriggerFullReconciliation()
{
   Print("[Lootly MT5] Reconciling all open positions and recent deals...");
   string payload = BuildFullPayload("[]", BuildPositionsJson(), BuildRecentDealsJson());
   bool ok = SendLootlyPayload(payload);
   if(ok)
   {
      Print("[Lootly MT5] Reconciliation complete. Account synchronized.");
   }
}

//+------------------------------------------------------------------+
//| Build Complete JSON Webhook Payload                              |
//+------------------------------------------------------------------+
string BuildFullPayload(string eventsJson, string openPositionsJson, string recentDealsJson)
{
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string broker = AccountInfoString(ACCOUNT_COMPANY);
   string server = AccountInfoString(ACCOUNT_SERVER);
   string currency = AccountInfoString(ACCOUNT_CURRENCY);
   long leverage = AccountInfoInteger(ACCOUNT_LEVERAGE);
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double marginLevel = AccountInfoDouble(ACCOUNT_MARGIN_LEVEL);
   
   ENUM_ACCOUNT_TRADE_MODE tradeMode = (ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE);
   bool isDemo = (tradeMode == ACCOUNT_TRADE_MODE_DEMO);

   string json = "{";
   json += "\"version\":\"1.00\",";
   json += "\"timestamp\":" + IntegerToString((long)TimeCurrent()) + ",";
   
   // Account details
   json += "\"account\":{";
   json += "\"login\":" + IntegerToString(login) + ",";
   json += "\"broker\":\"" + EscapeJson(broker) + "\",";
   json += "\"server\":\"" + EscapeJson(server) + "\",";
   json += "\"currency\":\"" + EscapeJson(currency) + "\",";
   json += "\"leverage\":" + IntegerToString(leverage) + ",";
   json += "\"isDemo\":" + (isDemo ? "true" : "false") + ",";
   json += "\"tradeMode\":\"" + (isDemo ? "demo" : "real") + "\",";
   json += "\"balance\":" + DoubleToString(balance, 2) + ",";
   json += "\"equity\":" + DoubleToString(equity, 2) + ",";
   json += "\"margin\":" + DoubleToString(margin, 2) + ",";
   json += "\"freeMargin\":" + DoubleToString(freeMargin, 2) + ",";
   json += "\"marginLevel\":" + DoubleToString(marginLevel, 2);
   json += "},";

   // Reconciliation Section
   json += "\"reconciliation\":{";
   json += "\"openPositions\":" + openPositionsJson + ",";
   json += "\"recentDeals\":" + recentDealsJson;
   json += "},";

   // Events Array
   json += "\"events\":" + eventsJson;
   json += "}";

   return json;
}

//+------------------------------------------------------------------+
//| Format Open Positions to JSON array                              |
//+------------------------------------------------------------------+
string BuildPositionsJson()
{
   int total = PositionsTotal();
   string json = "[";

   int count = 0;
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;

      if(count > 0) json += ",";
      json += FormatPositionJson(ticket);
      count++;
   }

   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Format Single Position to JSON string                            |
//+------------------------------------------------------------------+
string FormatPositionJson(ulong ticket)
{
   if(!PositionSelectByTicket(ticket)) return "{}";

   ulong identifier = PositionGetInteger(POSITION_IDENTIFIER);
   if(identifier <= 0) identifier = ticket;

   string symbol = PositionGetString(POSITION_SYMBOL);
   ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
   string dir = (type == POSITION_TYPE_BUY) ? "buy" : "sell";
   double volume = PositionGetDouble(POSITION_VOLUME);
   double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
   double currentPrice = PositionGetDouble(POSITION_PRICE_CURRENT);
   double sl = PositionGetDouble(POSITION_SL);
   double tp = PositionGetDouble(POSITION_TP);
   double profit = PositionGetDouble(POSITION_PROFIT);
   double swap = PositionGetDouble(POSITION_SWAP);
   datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
   string comment = PositionGetString(POSITION_COMMENT);
   long magic = PositionGetInteger(POSITION_MAGIC);

   string json = "{";
   json += "\"ticket\":" + IntegerToString(ticket) + ",";
   json += "\"identifier\":" + IntegerToString(identifier) + ",";
   json += "\"symbol\":\"" + EscapeJson(symbol) + "\",";
   json += "\"type\":\"" + dir + "\",";
   json += "\"volume\":" + DoubleToString(volume, 2) + ",";
   json += "\"openPrice\":" + DoubleToString(openPrice, 5) + ",";
   json += "\"currentPrice\":" + DoubleToString(currentPrice, 5) + ",";
   json += "\"sl\":" + DoubleToString(sl, 5) + ",";
   json += "\"tp\":" + DoubleToString(tp, 5) + ",";
   json += "\"profit\":" + DoubleToString(profit, 2) + ",";
   json += "\"swap\":" + DoubleToString(swap, 2) + ",";
   json += "\"openTime\":" + IntegerToString((long)openTime) + ",";
   json += "\"comment\":\"" + EscapeJson(comment) + "\",";
   json += "\"magic\":" + IntegerToString(magic);
   json += "}";

   return json;
}

//+------------------------------------------------------------------+
//| Format Recent Deals to JSON array                                |
//+------------------------------------------------------------------+
string BuildRecentDealsJson()
{
   datetime toDate = TimeCurrent();
   datetime fromDate = toDate - (7 * 86400); // Past 7 days

   HistorySelect(fromDate, toDate);
   int totalDeals = HistoryDealsTotal();

   string json = "[";
   int count = 0;

   // Take most recent 50 deals to protect request payload limits
   int startIdx = MathMax(0, totalDeals - 50);
   for(int i = startIdx; i < totalDeals; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket <= 0) continue;

      if(count > 0) json += ",";
      json += FormatDealJson(ticket);
      count++;
   }

   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Format Single Deal to JSON string                                |
//+------------------------------------------------------------------+
string FormatDealJson(ulong ticket)
{
   if(!HistoryDealSelect(ticket)) return "{}";

   ulong order = HistoryDealGetInteger(ticket, DEAL_ORDER);
   ulong position = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
   if(position <= 0) position = ticket;

   string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
   ENUM_DEAL_TYPE type = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
   string dir = (type == DEAL_TYPE_BUY) ? "buy" : (type == DEAL_TYPE_SELL) ? "sell" : "other";
   ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
   string entryStr = (entry == DEAL_ENTRY_IN) ? "in" : (entry == DEAL_ENTRY_OUT) ? "out" : (entry == DEAL_ENTRY_INOUT) ? "inout" : "out";
   
   double volume = HistoryDealGetDouble(ticket, DEAL_VOLUME);
   double price = HistoryDealGetDouble(ticket, DEAL_PRICE);
   double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
   double commission = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
   double swap = HistoryDealGetDouble(ticket, DEAL_SWAP);
   datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
   long reason = HistoryDealGetInteger(ticket, DEAL_REASON);
   string comment = HistoryDealGetString(ticket, DEAL_COMMENT);
   long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);

   string json = "{";
   json += "\"ticket\":" + IntegerToString(ticket) + ",";
   json += "\"order\":" + IntegerToString(order) + ",";
   json += "\"position\":" + IntegerToString(position) + ",";
   json += "\"symbol\":\"" + EscapeJson(symbol) + "\",";
   json += "\"type\":\"" + dir + "\",";
   json += "\"entry\":\"" + entryStr + "\",";
   json += "\"volume\":" + DoubleToString(volume, 2) + ",";
   json += "\"price\":" + DoubleToString(price, 5) + ",";
   json += "\"profit\":" + DoubleToString(profit, 2) + ",";
   json += "\"commission\":" + DoubleToString(commission, 2) + ",";
   json += "\"swap\":" + DoubleToString(swap, 2) + ",";
   json += "\"time\":" + IntegerToString((long)dealTime) + ",";
   json += "\"reason\":" + IntegerToString(reason) + ",";
   json += "\"comment\":\"" + EscapeJson(comment) + "\",";
   json += "\"magic\":" + IntegerToString(magic);
   json += "}";

   return json;
}

//+------------------------------------------------------------------+
//| Execute HTTPS WebRequest to Lootly Cloud API                     |
//+------------------------------------------------------------------+
bool SendLootlyPayload(string jsonPayload)
{
   char postData[];
   char resultData[];
   string resultHeaders;

   int dataLen = StringToCharArray(jsonPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(dataLen > 0 && postData[dataLen - 1] == 0)
   {
      ArrayResize(postData, dataLen - 1); // Strip null terminator
   }

   string headers = "Content-Type: application/json\r\n";
   headers += "Authorization: Bearer " + InpConnectorToken + "\r\n";

   ResetLastError();
   int timeout = 10000; // 10 seconds timeout
   int httpStatus = WebRequest("POST", InpLootlyUrl, headers, timeout, postData, resultData, resultHeaders);

   if(httpStatus == 200 || httpStatus == 201)
   {
      return true;
   }
   else
   {
      int err = GetLastError();
      if(httpStatus == 401)
      {
         Print("[Lootly MT5 Error] HTTP 401 Unauthorized: Invalid or revoked connector token!");
      }
      else if(httpStatus == -1)
      {
         Print("[Lootly MT5 Error] WebRequest failed. Error code: ", err);
         Print("[Lootly MT5 Tip] Ensure 'Allow WebRequest for listed URL' is enabled in Tools -> Options -> Expert Advisors with URL: https://lootly-mu.vercel.app");
      }
      else
      {
         Print("[Lootly MT5 Warning] Server returned HTTP ", httpStatus, ". Check terminal logs.");
      }
      return false;
   }
}

//+------------------------------------------------------------------+
//| Helper: Escape characters for safe JSON serialization            |
//+------------------------------------------------------------------+
string EscapeJson(string text)
{
   string res = "";
   int len = StringLen(text);
   for(int i = 0; i < len; i++)
   {
      ushort ch = StringGetCharacter(text, i);
      if(ch == '\"')      res += "\\\"";
      else if(ch == '\\') res += "\\\\";
      else if(ch == '\b') res += "\\b";
      else if(ch == '\f') res += "\\f";
      else if(ch == '\n') res += "\\n";
      else if(ch == '\r') res += "\\r";
      else if(ch == '\t') res += "\\t";
      else
      {
         res += ShortToString(ch);
      }
   }
   return res;
}
//+------------------------------------------------------------------+
