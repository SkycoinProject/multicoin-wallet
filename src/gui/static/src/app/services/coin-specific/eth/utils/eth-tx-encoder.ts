import BigNumber from 'bignumber.js';

/**
 * Data for creating an encoded unsigned transaction.
 */
export interface EthTransactionData {
  nonce: BigNumber;
  gasPriceInWei: BigNumber;
  gasLimit: BigNumber;
  destinationAddress: string;
  value: BigNumber;
  data: string;
  chainId: BigNumber;
}

/**
 * Allows to encode ETH transactions, to be able to send them to the network.
 */
export class EthTxEncoder {
  /**
   * Creates an encoded transaction using the Ethereum format.
   * @param transactionData Data for creating the transaction.
   */
  static encodeUnsigned(transactionData: EthTransactionData): string {
    let response = '';

    // Nonce.
    const nonce = EthTxEncoder.convertToValidRplHex(transactionData.nonce);
    response += EthTxEncoder.getRplHexSize(nonce) + nonce;

    // Gas price.
    const gasPrice = EthTxEncoder.convertToValidRplHex(transactionData.gasPriceInWei);
    response += EthTxEncoder.getRplHexSize(gasPrice) + gasPrice;

    // Gas limit.
    const gasLimit = EthTxEncoder.convertToValidRplHex(transactionData.gasLimit);
    response += EthTxEncoder.getRplHexSize(gasLimit) + gasLimit;

    // Destination address, without the '0x' part.
    if (transactionData.destinationAddress.startsWith('0x') || transactionData.destinationAddress.startsWith('0X')) {
      transactionData.destinationAddress = transactionData.destinationAddress.substr(2);
    }
    response += EthTxEncoder.getRplHexSize(transactionData.destinationAddress) + transactionData.destinationAddress;

    // Value.
    const value = EthTxEncoder.convertToValidRplHex(transactionData.value);
    response += EthTxEncoder.getRplHexSize(value) + value;

    // Data
    response += EthTxEncoder.getRplHexSize(transactionData.data) + transactionData.data;

    // V, in unsigned transactions it is just the chain ID.
    const v = EthTxEncoder.convertToValidRplHex(transactionData.chainId);
    response += EthTxEncoder.getRplHexSize(v) + v;

    // R and s, empty in unsigned transactions.
    response += 8080;

    // RPL payload size.
    response = EthTxEncoder.getRplHexSize(response, true) + response;

    return '0x' + response;
  }

  /**
   * Adds a signature to an unsigned raw transaction.
   * @param rawTX Raw transaction, generated with encodeUnsigned.
   * @param chainId Chain ID.
   * @param r R part of the signature, as a hex string.
   * @param s S part of the signature, as a hex string.
   * @param recoveryValue Recovery value for the signature. 0 if V = 26 or 1 if V = 27.
   */
  static addSignatureToRawTx(rawTX: string, chainId: BigNumber, r: string, s: string, recoveryValue: number): string {
    if (r.length !== 64 || s.length !== 64) {
      throw new Error('Invalid signature length.');
    }

    // Calculate the v value the unsigned raw transaction should have.
    let expectedVString = EthTxEncoder.convertToValidRplHex(chainId);
    expectedVString = EthTxEncoder.getRplHexSize(expectedVString) + expectedVString;

    // Remove everything after the v value.
    const VPosition = rawTX.lastIndexOf(expectedVString);
    if (VPosition === -1) {
      throw new Error('Invalid encoded transaction.');
    }
    rawTX = rawTX.substr(0, VPosition);

    // Calculate the new V value, using EIP-155.
    const newV = EthTxEncoder.convertToValidRplHex(chainId.multipliedBy(2).plus(35).plus(recoveryValue));

    // Add the signature.
    rawTX += EthTxEncoder.getRplHexSize(newV) + newV;
    rawTX += EthTxEncoder.getRplHexSize(r) + r;
    rawTX += EthTxEncoder.getRplHexSize(s) + s;

    // Remove the 0x part.
    rawTX = rawTX.substr(2);

    // Remove the RPL payload size, using the rules of the RPL format.
    const oldTransactionSize = new BigNumber(rawTX.substr(0, 2), 16);
    if (oldTransactionSize.isLessThanOrEqualTo('f7', 16)) {
      rawTX = rawTX.substr(2);
    } else {
      const transactionSizeBytes = oldTransactionSize.minus('f7', 16);
      rawTX = rawTX.substr(transactionSizeBytes.multipliedBy(2).plus(2).toNumber());
    }

    // Add the new RPL payload size.
    rawTX = EthTxEncoder.getRplHexSize(rawTX, true) + rawTX;

    return  '0x' + rawTX;
  }

  /**
   * Gets the size, in bytes, of a hex value, in the format neede for a RPL string.
   * @param data Hex string to check.
   * @param isTotalPayload If false, the value will be returned in the format needed for generic
   * values inside the RPL payload. If true, the format will be the one nedded for indicating the
   * size of the full RPL payload.
   */
  private static getRplHexSize(data: string, isTotalPayload = false): string {
    if (!data) {
      data = '';
    }

    // 0 is considered an empty value.
    if (new BigNumber(data).isEqualTo(0)) {
      return '80';
    }

    // Small values do not need size.
    if (!isTotalPayload && (data.length === 1 || data.length === 2)) {
      const val = new BigNumber(data, 16);
      if (val.isLessThan(128)) {
        return '';
      }
    }

    const bytes = new BigNumber(data.length).dividedBy(2).decimalPlaces(0, BigNumber.ROUND_CEIL);
    if (bytes.isLessThanOrEqualTo(55)) {
      const baseVaue = new BigNumber(isTotalPayload ? 'c0' : '80', 16);

      return bytes.plus(baseVaue).toString(16);
    } else {
      const bytesString = EthTxEncoder.convertToValidRplHex(bytes);
      const lengthBytes = new BigNumber(bytesString.length).dividedBy(2);

      const baseVaue = new BigNumber(isTotalPayload ? 'f7' : 'b7', 16);

      return EthTxEncoder.convertToValidRplHex(lengthBytes.plus(baseVaue)) + bytesString;
    }
  }

  /**
   * Converts a number into a hex string valid for a RPL string.
   * @param value Value to convert.
   */
  private static convertToValidRplHex(value: BigNumber): string {
    // 0 is considered an empty value.
    if (value.isEqualTo(0)) {
      return '';
    }

    let response = value.toString(16);
    // The length must be even.
    if (response.length % 2 !== 0) {
      response = '0' + response;
    }

    return response;
  }
}
