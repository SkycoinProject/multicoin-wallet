import BigNumber from 'bignumber.js';

/**
 * Input for a BTC transaction.
 */
export class BtcInput {
  /**
   * Hex string with the ID of the transaction were the input was created.
   */
  transaction: string;
  /**
   * Number of the input in the outputs list of the transaction were it was created.
   */
  vout: number;
  /**
   * Script, hex encoded.
   */
  script: string;
}

/**
 * Output for a BTC transaction.
 */
export class BtcOutput {
  /**
   * Coin value, in sats.
   */
  satsValue: BigNumber;
  /**
   * Script, hex encoded.
   */
  script: string;
}

/**
 * Allows to encode BTC transactions, to be able to send them to the network.
 */
export class BtcTxEncoder {
  /**
   * Creates an encoded transaction using the Bitcoin format.
   * @param inputs List of all inputs.
   * @param outputs List of all outputs.
   */
  static encode(inputs: BtcInput[], outputs: BtcOutput[]): string {
    // Calculate the size of the transaction and initialize the object used
    // for writting the byte data.
    const transactionSize = this.encodeSizeTransaction(inputs, outputs).toNumber();
    const buffer = new ArrayBuffer(transactionSize);
    const dataView = new DataView(buffer);
    let currentPos = 0;

    // Tx version.
    dataView.setUint32(currentPos, 1, true);
    currentPos += 4;

    // How many inputs the transaction has.
    currentPos = this.insertVariableSizeInt(dataView, currentPos, new BigNumber(inputs.length));

    inputs.forEach(input => {
      if (input.transaction.length % 2 !== 0) {
        throw new Error('Invalid hex string.');
      }

      // Reverse the transaction hash, as needed for the BTC transaction.
      let reversedTxHash = '';
      for (let i = 0; i < input.transaction.length; i += 2) {
        reversedTxHash = input.transaction.substr(i, 2) + reversedTxHash;
      }

      // Tx hash.
      const txHashBytes = this.convertToBytes(reversedTxHash);
      txHashBytes.forEach(number => {
        dataView.setUint8(currentPos, number);
        currentPos += 1;
      });

      // Output index.
      dataView.setUint32(currentPos, input.vout, true);
      currentPos += 4;

      // Length of the script.
      const scriptSize = new BigNumber(input.script.length).dividedBy(2).decimalPlaces(0, BigNumber.ROUND_CEIL);
      currentPos = this.insertVariableSizeInt(dataView, currentPos, scriptSize);

      // Script.
      const scriptBytes = this.convertToBytes(input.script);
      scriptBytes.forEach(number => {
        dataView.setUint8(currentPos, number);
        currentPos += 1;
      });

      // Sequence (ffffffff).
      dataView.setUint32(currentPos, 4294967295, true);
      currentPos += 4;
    });

    // How many outputs the transaction has.
    currentPos = this.insertVariableSizeInt(dataView, currentPos, new BigNumber(outputs.length));

    outputs.forEach(output => {
      // Coins.
      currentPos = this.setUint64(dataView, currentPos, output.satsValue);

      // Length of the script.
      const scriptSize = new BigNumber(output.script.length).dividedBy(2).decimalPlaces(0, BigNumber.ROUND_CEIL);
      currentPos = this.insertVariableSizeInt(dataView, currentPos, scriptSize);

      // Script.
      const scriptBytes = this.convertToBytes(output.script);
      scriptBytes.forEach(number => {
        dataView.setUint8(currentPos, number);
        currentPos += 1;
      });
    });

    // Lock time.
    dataView.setUint32(currentPos, 0, true);
    currentPos += 4;

    //

    return this.convertToHex(buffer);
  }

  /**
   * Calculates the final size, in bytes, that an encoded transaction will have.
   * @param inputs List of all inputs.
   * @param outputs List of all outputs.
   */
  private static encodeSizeTransaction(inputs: BtcInput[], outputs: BtcOutput[]): BigNumber {
    let size = new BigNumber(0);

    // Tx version.
    size = size.plus(4);

    // How many bytes will be needed for saving how many inputs the transaction has.
    size = size.plus(BtcTxEncoder.calculateVariableIntSize(new BigNumber(inputs.length)));

    inputs.forEach(input => {
      // Transaction hash, output index and sequence number.
      size = size.plus(40);

      // How many bytes will be needed for saving the length of the script and the script itself.
      const scriptSize = new BigNumber(input.script.length).dividedBy(2).decimalPlaces(0, BigNumber.ROUND_CEIL);
      size = size.plus(BtcTxEncoder.calculateVariableIntSize(scriptSize));
      size = size.plus(scriptSize);
    });

    // How many bytes will be needed for saving how many outputs the transaction has.
    size = size.plus(BtcTxEncoder.calculateVariableIntSize(new BigNumber(outputs.length)));

    outputs.forEach(output => {
      // Coin value.
      size = size.plus(8);

      // How many bytes will be needed for saving the length of the script and the script.
      const scriptSize = new BigNumber(output.script.length).dividedBy(2).decimalPlaces(0, BigNumber.ROUND_CEIL);
      size = size.plus(BtcTxEncoder.calculateVariableIntSize(scriptSize));
      size = size.plus(scriptSize);
    });

    // Lock time.
    size = size.plus(4);

    return size;
  }

  /**
   * Calculates how many bytes are needed for storing an int number. No more than 2 bytes
   * must be needed.
   */
  private static calculateVariableIntSize(int: BigNumber): BigNumber {
    const size = new BigNumber(int.toString(16).length).dividedBy(2).decimalPlaces(0, BigNumber.ROUND_CEIL);

    if (size.isGreaterThan(2)) {
      throw new Error('Invalid variable size int.');
    }

    return size;
  }

  /**
   * Writes an int number on a DataView using only as many bytes as needed. No more than 2 bytes
   * must be needed.
   * @param dataView DataView in which the value will be written.
   * @param currentPos Position inside the DataView in which the value will be written.
   * @param int Value to write.
   * @returns The position in which the next value will have to be written on the DataView.
   */
  private static insertVariableSizeInt(dataView: DataView, currentPos: number, int: BigNumber): number {
    // How many bytes will be needed for saving the value.
    const bytesForInputsNumber = BtcTxEncoder.calculateVariableIntSize(int);

    // Write the value.
    if (bytesForInputsNumber.isEqualTo(1)) {
      dataView.setUint8(currentPos, int.toNumber());

      return currentPos + 1;
    } else if (bytesForInputsNumber.isEqualTo(1)) {
      dataView.setUint16(currentPos, int.toNumber(), true);

      return currentPos + 2;
    } else {
      throw new Error('Invalid variable size int.');
    }
  }

  /**
   * Writes an Uint64 value on a DataView.
   * @param dataView DataView in which the value will be written.
   * @param currentPos Position inside the DataView in which the value will be written.
   * @param value Value to be written.
   * @returns The position in which the next value will have to be written on the DataView.
   */
  private static setUint64(dataView: DataView, currentPos: number, value: BigNumber): number {
    let hex = value.toString(16);
    // Make sure the hex string has an even number of characters.
    if (hex.length % 2 !== 0) {
      hex = '0' + hex;
    }

    const bytes = this.convertToBytes(hex);
    for (let i = bytes.length - 1; i >= 0; i--) {
      dataView.setUint8(currentPos, bytes[i]);
      currentPos += 1;
    }

    // Add zeros to fill the remaining space.
    for (let i = 0; i < 8 - bytes.length; i++) {
      dataView.setUint8(currentPos, 0);
      currentPos += 1;
    }

    return currentPos;
  }

  /**
   * Converts a hex string to a byte array.
   * @param hexString String to convert.
   */
  private static convertToBytes(hexString: string): number[] {
    if (hexString.length % 2 !== 0) {
      throw new Error('Invalid hex string.');
    }

    const result: number[] = [];

    for (let i = 0; i < hexString.length; i += 2) {
      result.push(parseInt(hexString.substr(i, 2), 16));
    }

    return result;
  }

  /**
   * Converts an ArrayBuffer to a hex string.
   * @param buffer ArrayBuffer to convert.
   */
  private static convertToHex(buffer: ArrayBuffer) {
    let result = '';

    (new Uint8Array(buffer)).forEach((v) => {
      let val = v.toString(16);
      if (val.length === 0) {
        val = '00';
      } else if (val.length === 1) {
        val = '0' + val;
      }
      result += val;
    });

    return result;
  }
}
