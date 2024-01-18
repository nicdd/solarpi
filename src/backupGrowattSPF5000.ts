import ModbusRTU from "modbus-serial"
import { getConfig, models } from "./config.js"
import fs from "fs"

const CONFIG_FILE = "options.json"

runBackup()

async function runBackup() {
    const modbusClient = new ModbusRTU()
    const config = getConfig(CONFIG_FILE)

    console.log("This back up utility is currently only written for SPF5000 inverters")
    console.log("Connecting to inverter")

    await modbusClient.connectRTUBuffered(config.inverter.usbDevice, {
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
    })

    modbusClient.setID(1);
    modbusClient.setTimeout(1000);
    console.log("Reading values");
	// Holding Registers 0 - 162
    const fromHoldingRegisters1 = await modbusClient.readHoldingRegisters(0, 26);
	modbusClient.setTimeout(1000);
	const fromHoldingRegisters2 = await modbusClient.readHoldingRegisters(26, 25);
	modbusClient.setTimeout(1000);
	const fromHoldingRegisters3 = await modbusClient.readHoldingRegisters(51, 25);
	modbusClient.setTimeout(1000);
	const fromHoldingRegisters4 = await modbusClient.readHoldingRegisters(76, 25);
	modbusClient.setTimeout(1000);
	const fromHoldingRegisters5 = await modbusClient.readHoldingRegisters(101, 25);
	modbusClient.setTimeout(1000);
	const fromHoldingRegisters6 = await modbusClient.readHoldingRegisters(126, 25);
	modbusClient.setTimeout(1000);
	const fromHoldingRegisters7 = await modbusClient.readHoldingRegisters(151, 12);
	modbusClient.setTimeout(1000);
	// Input Registers 0 - 90
    const fromInputRegisters1 = await modbusClient.readInputRegisters(0, 26);
	modbusClient.setTimeout(1000);
	const fromInputRegisters2 = await modbusClient.readInputRegisters(26, 25);
	modbusClient.setTimeout(1000);
	const fromInputRegisters3 = await modbusClient.readInputRegisters(51, 25);
	modbusClient.setTimeout(1000);
	const fromInputRegisters4 = await modbusClient.readInputRegisters(76, 14);
	modbusClient.setTimeout(1000);
    let backupText = "";
    backupText = backupText.concat("Holding Registers 0-25\n");
    const { data: data1 } = fromHoldingRegisters1;
    for (let i in data1) {
        backupText = backupText.concat(`${i} ${data1[i]}\n`);
    }
	backupText = backupText.concat("Holding Registers 26-50\n");
    const { data: data2 } = fromHoldingRegisters2;
    for (let i in data2) {
        backupText = backupText.concat(`${i} ${data2[i]}\n`);
    }
	backupText = backupText.concat("Holding Registers 51-75\n");
    const { data: data3 } = fromHoldingRegisters3;
    for (let i in data3) {
        backupText = backupText.concat(`${i} ${data3[i]}\n`);
    }
	backupText = backupText.concat("Holding Registers 76-100\n");
    const { data: data4 } = fromHoldingRegisters4;
    for (let i in data4) {
        backupText = backupText.concat(`${i} ${data4[i]}\n`);
    }
	backupText = backupText.concat("Holding Registers 101-125\n");
    const { data: data5 } = fromHoldingRegisters5;
    for (let i in data5) {
        backupText = backupText.concat(`${i} ${data5[i]}\n`);
    }
	backupText = backupText.concat("Holding Registers 126-150\n");
    const { data: data6 } = fromHoldingRegisters6;
    for (let i in data6) {
        backupText = backupText.concat(`${i} ${data6[i]}\n`);
    }
	backupText = backupText.concat("Holding Registers 151-162\n");
    const { data: data7 } = fromHoldingRegisters7;
    for (let i in data7) {
        backupText = backupText.concat(`${i} ${data7[i]}\n`);
    }



    backupText = backupText.concat("Input Registers 0-25\n");
    const { data: idata1 } = fromInputRegisters1;
    for (let i in idata1) {
        backupText = backupText.concat(`${i} ${idata1[i]}\n`);
    }
	backupText = backupText.concat("Input Registers 26-50\n");
    const { data: idata2 } = fromInputRegisters2;
    for (let i in idata2) {
        backupText = backupText.concat(`${i} ${idata2[i]}\n`);
    }
	backupText = backupText.concat("Input Registers 51-75\n");
    const { data: idata3 } = fromInputRegisters3;
    for (let i in idata3) {
        backupText = backupText.concat(`${i} ${idata3[i]}\n`);
    }
	backupText = backupText.concat("Input Registers 76-90\n");
    const { data: idata4 } = fromInputRegisters4;
    for (let i in idata4) {
        backupText = backupText.concat(`${i} ${idata4[i]}\n`);
    }
    backupText = backupText.concat("End\n");


    console.log("Writing to growattbackup.txt");
    fs.writeFile("growattbackup.txt", backupText, (error) => {
        if (error) {
            console.log("Error writing backup:", error);
        }
    });
    console.log("Backup done");
    modbusClient.close(() => {
    });

}
