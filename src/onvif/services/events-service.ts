import { SoapClient } from "../soap/soap-client.js";
import type { WsSecurityCredentials } from "../security/ws-security.js";

export interface OnvifEventMessage {
  topic: string;
  utcTime: Date;
  propertyOperation?: "Initialized" | "Deleted" | "Changed";
  sourceName?: string;
  sourceValue?: string;
  dataName?: string;
  dataValue?: boolean | string | number;
  rawXml?: string;
}

export interface PullPointSubscription {
  subscriptionAddress: string;
  currentTime: Date;
  terminationTime: Date;
}

export class EventsService {
  private readonly soap: SoapClient;
  private endpoint: string;
  private credentials?: WsSecurityCredentials;

  constructor(endpoint: string, credentials?: WsSecurityCredentials, soap: SoapClient = new SoapClient()) {
    this.endpoint = endpoint;
    this.credentials = credentials;
    this.soap = soap;
  }

  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  setCredentials(credentials: WsSecurityCredentials): void {
    this.credentials = credentials;
  }

  /**
   * tev:CreatePullPointSubscription
   */
  async createPullPointSubscription(initialTerminationTime = "PT600S"): Promise<PullPointSubscription> {
    const bodyXml = `
<tev:CreatePullPointSubscription xmlns:tev="http://www.onvif.org/ver10/events/wsdl">
  <tev:InitialTerminationTime>${initialTerminationTime}</tev:InitialTerminationTime>
</tev:CreatePullPointSubscription>`.trim();

    const response = await this.soap.request({
      endpoint: this.endpoint,
      action: "http://www.onvif.org/ver10/events/wsdl/CreatePullPointSubscription",
      bodyXml,
      credentials: this.credentials,
    });

    const subRefTag = SoapClient.extractTag(response, "SubscriptionReference");
    const address = subRefTag ? SoapClient.extractTag(subRefTag, "Address") || this.endpoint : this.endpoint;
    const currentTimeStr = SoapClient.extractTag(response, "CurrentTime") || new Date().toISOString();
    const terminationTimeStr = SoapClient.extractTag(response, "TerminationTime") || new Date(Date.now() + 600000).toISOString();

    return {
      subscriptionAddress: address,
      currentTime: new Date(currentTimeStr),
      terminationTime: new Date(terminationTimeStr),
    };
  }

  /**
   * tev:PullMessages
   */
  async pullMessages(
    pullPointAddress: string,
    messageLimit = 10,
    timeoutMs = 5000,
  ): Promise<{ messages: OnvifEventMessage[]; currentTime: Date; terminationTime: Date }> {
    const timeoutIso = `PT${Math.max(1, Math.round(timeoutMs / 1000))}S`;

    const bodyXml = `
<tev:PullMessages xmlns:tev="http://www.onvif.org/ver10/events/wsdl">
  <tev:Timeout>${timeoutIso}</tev:Timeout>
  <tev:MessageLimit>${messageLimit}</tev:MessageLimit>
</tev:PullMessages>`.trim();

    const response = await this.soap.request({
      endpoint: pullPointAddress,
      action: "http://www.onvif.org/ver10/events/wsdl/PullMessages",
      bodyXml,
      credentials: this.credentials,
      timeoutMs: timeoutMs + 3000, // allow network cushion over pull timeout
    });

    const currentTimeStr = SoapClient.extractTag(response, "CurrentTime") || new Date().toISOString();
    const terminationTimeStr = SoapClient.extractTag(response, "TerminationTime") || new Date(Date.now() + 600000).toISOString();

    const notificationMessages = SoapClient.extractAllTags(response, "NotificationMessage");
    const parsedMessages: OnvifEventMessage[] = [];

    for (const notifXml of notificationMessages) {
      const topic = SoapClient.extractTag(notifXml, "Topic") || "UnknownTopic";
      const messageTag = SoapClient.extractTag(notifXml, "Message");

      let utcTime = new Date();
      let propertyOperation: any;
      let sourceName: string | undefined;
      let sourceValue: string | undefined;
      let dataName: string | undefined;
      let dataValue: boolean | string | number | undefined;

      if (messageTag) {
        const utcStr = SoapClient.extractAttribute(messageTag, "UtcTime");
        if (utcStr) utcTime = new Date(utcStr);

        propertyOperation = SoapClient.extractAttribute(messageTag, "PropertyOperation") as any;

        const sourceTag = SoapClient.extractTag(messageTag, "Source");
        if (sourceTag) {
          const simpleItem = SoapClient.extractTag(sourceTag, "SimpleItem");
          if (simpleItem) {
            sourceName = SoapClient.extractAttribute(simpleItem, "Name") ?? undefined;
            sourceValue = SoapClient.extractAttribute(simpleItem, "Value") ?? undefined;
          }
        }

        const dataTag = SoapClient.extractTag(messageTag, "Data");
        if (dataTag) {
          const simpleItem = SoapClient.extractTag(dataTag, "SimpleItem");
          if (simpleItem) {
            dataName = SoapClient.extractAttribute(simpleItem, "Name") ?? undefined;
            const val = SoapClient.extractAttribute(simpleItem, "Value");
            if (val === "true") dataValue = true;
            else if (val === "false") dataValue = false;
            else if (val !== null && !isNaN(Number(val))) dataValue = Number(val);
            else if (val !== null) dataValue = val;
          }
        }
      }

      parsedMessages.push({
        topic,
        utcTime,
        propertyOperation,
        sourceName,
        sourceValue,
        dataName,
        dataValue,
        rawXml: notifXml,
      });
    }

    return {
      messages: parsedMessages,
      currentTime: new Date(currentTimeStr),
      terminationTime: new Date(terminationTimeStr),
    };
  }

  /**
   * tev:Unsubscribe (WS-BaseNotification)
   */
  async unsubscribe(pullPointAddress: string): Promise<void> {
    const bodyXml = `<wsnt:Unsubscribe xmlns:wsnt="http://docs.oasis-open.org/wsn/b-2" />`;

    try {
      await this.soap.request({
        endpoint: pullPointAddress,
        action: "http://docs.oasis-open.org/wsn/bw-2/SubscriptionManager/UnsubscribeRequest",
        bodyXml,
        credentials: this.credentials,
      });
    } catch {
      // Ignore unsubscribe teardown error
    }
  }
}
