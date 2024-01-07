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

    modbusClient.setID(1)
    modbusClient.setTimeout(5000)

    console.log("Reading values")

    const fromHoldingRegisters = await modbusClient.readHoldingRegisters(0, 162)
    
    const fromInputRegisters = await modbusClient.readInputRegisters(0, 90)
    
    let backupText: string = "";

    backupText = backupText.concat("Growatt Registers Backup\nHolding Registers 0-162\n")

    const { data: data1 } = fromHoldingRegisters
    for (let i in data1) {
        backupText = backupText.concat(`${i} ${data1[i]}\n`)
    }    

    backupText = backupText.concat("Input Registers 0-90\n")

    const { data: data3 } = fromInputRegisters
    for (let i in data3) {
        backupText = backupText.concat(`${i} ${data3[i]}\n`)
    }    

    backupText = backupText.concat("End\n")

    console.log("Writing to growattbackup.txt")

    fs.writeFile("growattbackup.txt", backupText, (error) => {
        if (error) {
            console.log("Error writing backup:", error)
        }
    })

    console.log("Backup done")

    modbusClient.close(() => {

    })

}
