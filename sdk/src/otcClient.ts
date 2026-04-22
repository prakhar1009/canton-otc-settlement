/**
 * @file This file contains a TypeScript SDK for interacting with the Canton OTC Settlement Daml contracts
 * via the Canton JSON Ledger API. It provides a convenient, typed interface for dApp developers.
 */

/**
 * A generic representation of a Daml contract fetched from the JSON API.
 * @template T The type of the contract payload.
 */
export interface DamlContract<T> {
  contractId: string;
  templateId: string;
  payload: T;
  agreementText: string;
}

/**
 * Represents the payload of the `OTC.CounterpartyRegistry:CounterpartyRole` template.
 * This contract establishes a trading relationship and lists approved counterparties.
 */
export interface CounterpartyRole {
  operator: string; // Party
  trader: string;   // Party
  approvedCounterparties: string[]; // Party[]
}

/**
 * Represents the payload of the `OTC.MatchingEngine:TradeProposal` template.
 * This contract is a sealed, one-sided proposal for a bilateral trade.
 */
export interface TradeProposal {
  proposer: string;        // Party
  counterparty: string;    // Party
  tradeId: string;         // Text, a unique identifier for the proposal
  buyInstrument: string;   // Text, e.g., ISIN or CUSIP
  buyQuantity: string;     // Decimal
  sellInstrument: string;  // Text
  sellQuantity: string;    // Decimal
  settlementDate: string;  // Date, in YYYY-MM-DD format
}

/**
 * Represents the payload of the `OTC.TradeConfirmation:TradeConfirmation` template.
 * This contract is created when two matching `TradeProposal` contracts are found.
 * It represents a legally binding trade ready for settlement.
 */
export interface TradeConfirmation {
  partyA: string;          // Party
  partyB: string;          // Party
  tradeId: string;         // Text
  buyInstrument: string;   // Text
  buyQuantity: string;     // Decimal
  sellInstrument: string;  // Text
  sellQuantity: string;    // Decimal
  settlementDate: string;  // Date
  // An optional reference to a settlement instruction contract, which may be created
  // when settlement is initiated.
  settlementInstructionCid?: string;
}

/**
 * Type for the arguments required to submit a new trade proposal.
 * The `proposer` field is omitted as it is automatically set to the client's party ID.
 */
export type SubmitProposalArgs = Omit<TradeProposal, "proposer">;

/**
 * A client for interacting with the OTC trade workflow on a Canton ledger.
 */
export class OtcClient {
  private readonly ledgerUrl: string;
  private readonly partyId: string;
  private readonly token: string;

  /**
   * Creates a new instance of the OtcClient.
   * @param ledgerUrl The base URL of the Canton participant's JSON API (e.g., http://localhost:7575).
   * @param partyId The party ID of the user on whose behalf commands will be submitted.
   * @param token A valid JWT for authenticating with the JSON API.
   */
  constructor(ledgerUrl: string, partyId: string, token: string) {
    if (!ledgerUrl || !ledgerUrl.startsWith("http")) {
      throw new Error("A valid ledgerUrl (e.g., http://localhost:7575) is required.");
    }
    if (!partyId) {
      throw new Error("A partyId is required.");
    }
    if (!token) {
      throw new Error("An authentication token is required.");
    }

    this.ledgerUrl = ledgerUrl.replace(/\/$/, ""); // Remove trailing slash
    this.partyId = partyId;
    this.token = token;
  }

  /**
   * A private helper method to execute authenticated requests against the JSON API.
   * @template T The expected type of the `result` field in the API response.
   * @param endpoint The API endpoint to call (e.g., /v1/create).
   * @param method The HTTP method.
   * @param body The request body, to be serialized as JSON.
   * @returns A promise that resolves to the `result` of the API call.
   */
  private async _request<T>(endpoint: string, method: "GET" | "POST", body?: object): Promise<T> {
    const url = `${this.ledgerUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request to ${endpoint} failed with status ${response.status}: ${errorBody}`);
      }
      const json = await response.json();
      if (json.status !== 200) {
        throw new Error(`API returned non-200 status in body: ${JSON.stringify(json.errors)}`);
      }
      return json.result as T;
    } catch (error) {
      console.error(`Network or API error during request to ${endpoint}:`, error);
      throw error;
    }
  }

  /**
   * Submits a new sealed trade proposal. This creates an `OTC.MatchingEngine:TradeProposal` contract.
   * @param args The details of the trade being proposed.
   * @returns The created `TradeProposal` contract.
   */
  public async submitProposal(args: SubmitProposalArgs): Promise<DamlContract<TradeProposal>> {
    const payload: TradeProposal = {
      proposer: this.partyId,
      ...args,
    };

    return this._request<DamlContract<TradeProposal>>("/v1/create", "POST", {
      templateId: "OTC.MatchingEngine:TradeProposal",
      payload,
    });
  }

  /**
   * Fetches all active trade proposals where the client's party is either the proposer or the counterparty.
   * @returns An array of active `TradeProposal` contracts.
   */
  public async getProposals(): Promise<DamlContract<TradeProposal>[]> {
    return this._request<DamlContract<TradeProposal>[]>("/v1/query", "POST", {
      templateIds: ["OTC.MatchingEngine:TradeProposal"],
    });
  }

  /**
   * Fetches all active trade confirmations where the client's party is involved.
   * @returns An array of active `TradeConfirmation` contracts.
   */
  public async getConfirmations(): Promise<DamlContract<TradeConfirmation>[]> {
    return this._request<DamlContract<TradeConfirmation>[]>("/v1/query", "POST", {
      templateIds: ["OTC.TradeConfirmation:TradeConfirmation"],
    });
  }

  /**
   * Fetches a single trade confirmation by its contract ID. Returns null if not found or not visible.
   * @param contractId The contract ID of the `TradeConfirmation` to fetch.
   * @returns The `TradeConfirmation` contract or null.
   */
  public async getConfirmation(contractId: string): Promise<DamlContract<TradeConfirmation> | null> {
    try {
      const result = await this._request<DamlContract<TradeConfirmation>>(`/v1/contracts/${encodeURIComponent(contractId)}`, "GET");
      if (result && result.templateId === "OTC.TradeConfirmation:TradeConfirmation") {
        return result;
      }
      console.warn(`Contract ${contractId} is not a TradeConfirmation, but a ${result?.templateId}`);
      return null;
    } catch (error) {
      // The API returns a 404 if the contract is not found or the party cannot see it.
      // Our helper turns this into an exception, which we catch here and interpret as "not found".
      return null;
    }
  }

  /**
   * Initiates the DvP settlement process for a confirmed trade by exercising the `InitiateSettlement` choice.
   * @param confirmationCid The contract ID of the `TradeConfirmation` to settle.
   * @param deliveryAssetCid The contract ID of the asset being delivered to the counterparty.
   * @returns The result of the choice exercise, typically including events for created/archived contracts.
   */
  public async initiateSettlement(confirmationCid: string, deliveryAssetCid: string): Promise<any> {
    return this._request<any>("/v1/exercise", "POST", {
      templateId: "OTC.TradeConfirmation:TradeConfirmation",
      contractId: confirmationCid,
      choice: "InitiateSettlement",
      argument: {
        deliveryAssetCid,
      },
    });
  }

  /**
   * Fetches the `CounterpartyRole` contract for the client's party.
   * This is useful for finding the list of approved counterparties.
   * @returns The `CounterpartyRole` contract, or null if it doesn't exist for the party.
   */
  public async getCounterpartyRole(): Promise<DamlContract<CounterpartyRole> | null> {
    const contracts = await this._request<DamlContract<CounterpartyRole>[]>("/v1/query", "POST", {
      templateIds: ["OTC.CounterpartyRegistry:CounterpartyRole"],
      // Query specifically for contracts where our party is the trader.
      query: { trader: this.partyId },
    });
    if (contracts.length > 1) {
      console.warn(`Found multiple CounterpartyRole contracts for party ${this.partyId}. Returning the first.`);
    }
    return contracts[0] ?? null;
  }
}