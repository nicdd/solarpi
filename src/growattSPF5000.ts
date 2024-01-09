// This class is specific to Growatt SPF5000 inverter but is likely to
// work for other SPH inverters unless these have more than 2 strings
// of panels (then only the first two will be read)

import { ModbusRTU, ReadRegisterResult, WriteMultipleResult } from "modbus-serial/ModbusRTU"
import { Inverter, Command, SensorEntity, ControlEntity, SensorEntities, ControlEntities, CommandEntity, CommandEntities, ControlData } from "./inverter"
import Ajv from "ajv"
import { Mutex } from 'async-mutex'
import { logDate } from "./logDate.js"

interface TouChargingValues {
    
    uwAC2BatVolt: number, // We assume that we are using lithium battery, that is why the interval is 0-100 % default 50%. Switch from Utility AC to Battery
    chargeConfig: number,
    utiChargeStart: number,    
    utiChargeEnd: number      
}

interface TouDischargingValues {
    batLowToUtiVolt: number, // We assume that we are using lithium battery, that is why the interval is 0-100 % default 30%. Switch from Battery to Utility AC
    utiOutStart: number,    
    utiOutEnd: number      
}

interface TimeValues {
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number
}

export class GrowattSPF5000 implements Inverter {

	/** What do I want to know from the Holding Reg Values (W = By User writable = true/false)
	----------------------------------------------------------------------------------------
	|RegNo	|	VariableName   | W		|	Description 
	----------------------------------------------------------------------------------------
	00		*	On/Off			* false	*	The Standby On/Off state and the AC output DisEN/EN state; The low byte is the Standby on/off(1/0), 
											the high byte is the AC output disable/enable (1/0). ex: 0x0101 means inverter on
	01		*	OutputConfig	* true	*	AC output set: 0: BAT First; 1: PV First; 2: UTI First; 3: PV&UTI First
	02		*	ChargeConfig	* true	*	Charge source set: 0: PV first; 1: PV&UTI; 2: PV Only;
	03		*	UtiOutStart		* true	*	Uti Output Start Time: 0-23 Hour
	04		*	UtiOutEnd		* true	*	Uti Output End Time: 0-23 Hour
	05		*	UtiChargeStart	* true	*	Uti Charge Start Time: 0-23 Hour
	06		*	UtiChargeEnd	* true	*	Uti Charge End Time: 0-23 Hour
	12		*	Fw version2 H	* false	*	Control Firmware version (high) Ascii
	13		*	Fw version2 M	* false	*	Control Firmware version (middle) Ascii
	14		*	Fw version2 L	* false	*	Control Firmware version (low) Ascii
	18		*	OutputVoltType	* true	*	0: 208VAC; 1: 230VAC 2: 240VAC 3:220VAC 4:100VAC 5:110VAC 6:120VAC
	22		*	BuzzerEN		* true	*	1:Enable;	0:Disable;	
	37		*	BatLowToUtiVolt	* true	*	Bat Low Volt Switch To Uti 200~640 (non Lithium) or 5~100 (Lithium) default: 460 Or 50%
	82		*	wBatLowCutOff	* false	*	Bat voltage low cutoff 200~640 (non Lithium) or 5~100 (Lithium) default: 460 Or 50%
	95		*	uwAC2BatVolt	* false	*	AC switch to Battery 200~640 (non Lithium) or 5~100 (Lithium) default: 460 Or 50%
	
	ToDo: read all interesting registers not only charge and discharge, see example "Get Inverter Time"
	*/	

    mutex = new Mutex()

    private sensorEntities: SensorEntity[] = [
        {
            name: "Inverter Status",
            type: "sensor",
            unique_id: "solarpi_inverter_status",
            value_template: "{{ value_json.inverterStatus }}"
        },
        {
            name: "PV Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_pv",
            value_template: "{{ value_json.ppv }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "PV1 Voltage",
            type: "sensor",
            device_class: "voltage",
            unit_of_measurement: "V",
            unique_id: "solarpi_voltage_pv1",
            value_template: "{{ value_json.vpv1 }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "PV1 Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_pv1",
            value_template: "{{ value_json.ppv1 }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "PV2 Voltage",
            type: "sensor",
            device_class: "voltage",
            unit_of_measurement: "V",
            unique_id: "solarpi_voltage_pv2",
            value_template: "{{ value_json.vpv2 }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "PV2 Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_pv2",
            value_template: "{{ value_json.ppv2 }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "PV Energy Today",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_pv_today",
            value_template: "{{ value_json.epvToday }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "PV Energy Total",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_pv_total",
            value_template: "{{ value_json.epvTotal }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Grid Voltage",
            type: "sensor",
            device_class: "voltage",
            unit_of_measurement: "V",
            unique_id: "solarpi_voltage_grid",
            value_template: "{{ value_json.vgrid }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Inverter Temperature",
            type: "sensor",
            device_class: "temperature",
            state_class: "measurement",
            unit_of_measurement: "°C",
            unique_id: "solarpi_temperature_inverter",
            value_template: "{{ value_json.inverterTemperature }}"
        },
        {
            name: "Inverter Error",
            type: "sensor",
            unique_id: "solarpi_inverter_error",
            value_template: "{{ value_json.inverterError }}"
        },
        {
            name: "Battery Discharge Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_discharge",
            value_template: "{{ value_json.pDischarge }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Battery Charge Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_charge",
            value_template: "{{ value_json.pCharge }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "State of Charge",
            type: "sensor",
            state_class: "measurement",
            unit_of_measurement: "%",
            unique_id: "solarpi_state_of_charge",
            value_template: "{{ value_json.soc }}"
        },
        {
            name: "Import Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_import",
            value_template: "{{ value_json.pImport }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Export Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_export",
            value_template: "{{ value_json.pExport }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Load Power",
            type: "sensor",
            device_class: "power",
            state_class: "measurement",
            unit_of_measurement: "W",
            unique_id: "solarpi_power_to_load",
            value_template: "{{ value_json.pLoad }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Import Energy Today",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_import_today",
            value_template: "{{ value_json.eImportToday }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Import Energy Total",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_import_total",
            value_template: "{{ value_json.eImportTotal }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Export Energy Today",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_export_today",
            value_template: "{{ value_json.eExportToday }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Export Energy Total",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_export_total",
            value_template: "{{ value_json.eExportTotal }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Battery Discharge Energy Today",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_discharge_today",
            value_template: "{{ value_json.eDischargeToday }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Battery Discharge Energy Total",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_discharge_total",
            value_template: "{{ value_json.eDischargeTotal }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Battery Charge Energy Today",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_charge_today",
            value_template: "{{ value_json.eChargeToday }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Battery Charge Energy Total",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_charge_total",
            value_template: "{{ value_json.eChargeTotal }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Load Energy Today",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_to_load_today",
            value_template: "{{ value_json.eLoadToday }}",
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Load Energy Total",
            type: "sensor",
            device_class: "energy",
            state_class: "total",
            unit_of_measurement: "kWh",
            unique_id: "solarpi_energy_to_load_total",
            value_template: "{{ value_json.eLoadTotal }}",
            icon: "mdi:lightning-bolt"
        }
    ]

    private commandEntities: CommandEntity[] = [
        {
            name: "Get TOU Charge",
            type: "button",
            unique_id: "solarpi_tou_charge_get",
            command_template: '{ "command": {{ value }} }',
            payload_press: '"getTouCharging"',
            icon: "mdi:help"
        },
        {
            name: "Set TOU Charge",
            type: "button",
            unique_id: "solarpi_tou_charge_set",
            command_template: '{ "command": {{ value }} }',
            payload_press: '"setTouCharging"',
            icon: "mdi:check"
        },
        {
            name: "Get TOU Discharge",
            type: "button",
            unique_id: "solarpi_tou_discharge_get",
            command_template: '{ "command": {{ value }} }',
            payload_press: '"getTouDischarging"',
            icon: "mdi:help"
        },
        {
            name: "Set TOU Discharge",
            type: "button",
            unique_id: "solarpi_tou_discharge_set",
            command_template: '{ "command": {{ value }} }',
            payload_press: '"setTouDischarging"',
            icon: "mdi:check"
        },
        {
            name: "Get Inverter Time",
            type: "button",
            unique_id: "solarpi_time_get",
            command_template: '{ "command": {{ value }} }',
            payload_press: '"getTime"',
            icon: "mdi:check"
        }
    ]

    private touChargingControlEntities: ControlEntity[] = [
        
        {
            name: "Charge Stop SOC",
            type: "number",
            state_class: "measurement",
            unit_of_measurement: "%",
            unique_id: "solarpi_tou_charge_stop_soc",
            value_template: "{{ value_json.uwAC2BatVolt }}",
            command_template: '{{ {"uwAC2BatVolt": value} }}',
            mode: "box",
            min: 0,
            max: 100,
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Charge Config",
            type: "number",
            unique_id: "solarpi_tou_charge_config",
            value_template: "{{ value_json.chargeConfig }}",
			command_template: '{{ {"chargeConfig": value} }}',
            mode: "box",
            min: 0,
            max: 2,            
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Charge 1 Start Hour",
            type: "number",
            unique_id: "solarpi_tou_charge_1_start_hour",
            value_template: "{{ value_json.utiChargeStart }}",
            command_template: '{{ {"utiChargeStart": value} }}',
            mode: "box",
            min: 0,
            max: 23,
            icon: "mdi:clock-outline"
        },
        
        {
            name: "Charge 1 Stop Hour",
            type: "number",
            unique_id: "solarpi_tou_charge_1_stop_hour",
            value_template: "{{ value_json.utiChargeEnd }}",
            command_template: '{{ {"utiChargeEnd": value} }}',
            mode: "box",
            min: 0,
            max: 23,
            icon: "mdi:clock-outline"
        }
        
    ]

    private touDischargingControlEntities: ControlEntity[] = [
        
        {
            name: "Discharge Stop SOC",
            type: "number",
            state_class: "measurement",
            unit_of_measurement: "%",
            unique_id: "solarpi_tou_discharge_stop_soc",
            value_template: "{{ value_json.batLowToUtiVolt }}",
            command_template: '{{ {"batLowToUtiVolt": value} }}',
            mode: "box",
            min: 0,
            max: 100,
            icon: "mdi:lightning-bolt"
        },
        {
            name: "Discharge 1 Start Hour",
            type: "number",
            unique_id: "solarpi_tou_discharge_1_start_hour",
            value_template: "{{ value_json.utiOutStart }}",
            command_template: '{{ {"utiOutStart": value} }}',
            mode: "box",
            min: 0,
            max: 23,
            icon: "mdi:clock-outline"
        },        
        {
            name: "Discharge 1 Stop Hour",
            type: "number",
            unique_id: "solarpi_tou_discharge_1_stop_hour",
            value_template: "{{ value_json.utiOutEnd }}",
            command_template: '{{ {"utiOutEnd": value} }}',
            mode: "box",
            min: 0,
            max: 23,
            icon: "mdi:clock-outline"
        }
    ]

    // Object to retain TOU charging values which have been read from the inverter
    // or modified by MQTT messages
    private touChargingValues: TouChargingValues = {
        uwAC2BatVolt: 50,
        chargeConfig: 0,
        utiChargeStart: 0,        
        utiChargeEnd: 0              
    }

    // Object to retain TOU discharging values which have been read from the inverter
    // or modified by MQTT messages
    private touDischargingValues: TouDischargingValues = {
        batLowToUtiVolt: 30,
        utiOutStart: 0,        
        utiOutEnd: 0        
    }

    // Wrapper methods to allow use of mutex as it seems ModbusRTU allows
    // read and writes to overlap
    // TODO create class that extends ModbusRTU with mutexed methods (and with timeouts)
    private async readInputRegisters(modbusClient: ModbusRTU, dataAddress: number, length: number): Promise<ReadRegisterResult> {
        const release = await this.mutex.acquire()
        let result: ReadRegisterResult
        try {
            result = await modbusClient.readInputRegisters(dataAddress, length)
        } finally {
            release()
        }
        return result
    }

    private async readHoldingRegisters(modbusClient: ModbusRTU, dataAddress: number, length: number): Promise<ReadRegisterResult> {
        const release = await this.mutex.acquire()
        let result: ReadRegisterResult
        try {
            result = await modbusClient.readHoldingRegisters(dataAddress, length)
        } finally {
            release()
        }
        return result
    }

    private async writeRegisters(modbusClient: ModbusRTU, dataAddress: number, values: number[] | Buffer): Promise<WriteMultipleResult> {
        const release = await this.mutex.acquire()
        let result: WriteMultipleResult
        try {
            result = await modbusClient.writeRegisters(dataAddress, values)
        } finally {
            release()
        }
        return result
    }

    public getSensorEntities(): SensorEntities {
        return {
            subTopic: "inverter", //TODO think about removing this and handling subTopic elsewhere
            entities: this.sensorEntities
        }
    }

    public getCommandEntities(): CommandEntities {
        return {
            subTopic: "command",
            entities: this.commandEntities
        }
    }

    public getControlEntities(): ControlEntities[] {
        return [
            {
                subTopic: "touCharging",
                entities: this.touChargingControlEntities
            },
            {
                subTopic: "touDischarging",
                entities: this.touDischargingControlEntities
            }
        ]
    }

    public updateControl(subTopic: string, controlMessage: string): ControlData[] {
        try {
            const control = JSON.parse(controlMessage.replace(/'/g, '"'))
            const keys = Object.keys(control)
            keys.forEach((key, index) => {
                if (subTopic == 'touCharging' && typeof this.touChargingValues[key] !== 'undefined') {
                    this.touChargingValues[key] = control[key]
                } else if (subTopic == 'touDischarging' && typeof this.touDischargingValues[key] !== 'undefined') {
                    this.touDischargingValues[key] = control[key]
                }
            })
        } catch (error) {
            console.log(`${logDate()} Error parsing controlMessage in updateControl(). Continuing.`)
        }

        // Return all the control values (could be reduced to just the set that have been updated)
        return [
            {
                subTopic: "touCharging",
                values: this.touChargingValues
            },
            {
                subTopic: "touDischarging",
                values: this.touDischargingValues
            }
        ]
    }

    public async getControlValues(modbusClient: ModbusRTU): Promise<ControlData[]> {
        return [
            {
                subTopic: "touCharging",
                values: await this.getTouCharging(modbusClient)
            },
            {
                subTopic: "touDischarging",
                values: await this.getTouDischarging(modbusClient)
            }
        ]
    }

    public async getSensorData(modbusClient: ModbusRTU): Promise<{}> {
        // For SPF5000 read the 90 input register values starting at address 0
        const inputRegisters = await this.readInputRegisters(modbusClient, 0, 90);       
        return this.parseInputRegisters(inputRegisters);
    }

    private async setTouCharging(modbusClient: ModbusRTU): Promise<void> {
        // Validate the contents of touChargingValues object
        const ajv = new Ajv()
        const schema = {
            type: "object",
            properties: {
                uwAC2BatVolt: { type: "number", minimum: 0, maximum: 100 },// We assume that we are using lithium battery, that is why the interval is 0-100 %
                chargeConfig: { type: "number", minimum: 0, maximum: 2 },//default 0 PV First, 1 PV&Utility, 2 PV Only
                utiChargeStart: { type: "number", minimum: 0, maximum: 23 },
                utiChargeEnd: { type: "number", minimum: 0, maximum: 23 }
                
            },
            required: ["uwAC2BatVolt", "chargeConfig", "utiChargeStart", "utiChargeEnd"],
            additionalProperties: false
        }
        const validate = ajv.compile(schema)
        if (!validate(this.touChargingValues)) {
            console.log("Validate errors:", validate.errors)
            throw "Error validating setTouCharging"
        }

        const writeRegisters1: Array<number> = [            
            this.touChargingValues.uwAC2BatVolt
        ]
		const writeRegisters2: Array<number> = [            
            this.touChargingValues.chargeConfig
        ]
        const writeRegisters3: Array<number> = [
            (this.touChargingValues.utiChargeStart << 8),
            (this.touChargingValues.utiChargeEnd << 8)
        ]

        // Write writeRegisters1 to holding register 95
        await this.writeRegisters(modbusClient, 95, writeRegisters1)
		// Write writeRegisters2 to holding register 02
        await this.writeRegisters(modbusClient, 2, writeRegisters2)
        // Write writeRegisters3 to holding registers 05-06
        await this.writeRegisters(modbusClient, 5, writeRegisters3)
    }

    private async setTouDischarging(modbusClient: ModbusRTU): Promise<void> {
        // Validate the contents of touDischargingValues object
        const ajv = new Ajv()
        const schema = {
            type: "object",
            properties: {
                batLowToUtiVolt: { type: "number", minimum: 20, maximum: 90 },
                utiOutStart: { type: "number", minimum: 0, maximum: 23 },
                utiOutEnd: { type: "number", minimum: 0, maximum: 23 }
            },
            required: ["batLowToUtiVolt", "utiOutStart", "utiOutEnd"],
            additionalProperties: false
        }
        const validate = ajv.compile(schema)
        if (!validate(this.touDischargingValues)) {
            console.log("Validate errors:", validate.errors)
            throw "Error validating setTouDischarging"
        }

        const writeRegisters1: Array<number> = [
            this.touDischargingValues.batLowToUtiVolt
        ]

        const writeRegisters2: Array<number> = [
            (this.touDischargingValues.utiOutStart << 8),
            (this.touDischargingValues.utiOutEnd << 8)
        ]

        // Write writeRegisters1 to holding register 37
        await this.writeRegisters(modbusClient, 37, writeRegisters1)
        // Write writeRegisters2 to holding registers 03-04
        await this.writeRegisters(modbusClient, 3, writeRegisters2)
    }

    private async getTouCharging(modbusClient: ModbusRTU): Promise<TouChargingValues> {
        const holdingRegisters1 = await this.readHoldingRegisters(modbusClient, 0, 7)
		const holdingRegisters2 = await this.readHoldingRegisters(modbusClient, 95, 1)
        //const holdingRegisters3 = await this.readHoldingRegisters(modbusClient, 12, 3) // Firmware Version, evtl to the sensor entities		
        //const holdingRegisters4 = await this.readHoldingRegisters(modbusClient, 22, 1) //Buzzer on/off

        const { data: data1 } = holdingRegisters1
        const { data: data2 } = holdingRegisters2
		//const { data: data3 } = holdingRegisters3
        //const { data: data4 } = holdingRegisters4

        // TODO review why this is saved to class scoped variable and returned from a private function
        this.touChargingValues = {
            uwAC2BatVolt: data2[0],
            chargeConfig: data1[2],
            utiChargeStart: data1[6] >> 8,            
            utiChargeEnd: data1[7] >> 8            
        }

        return this.touChargingValues
    }

    private async getTouDischarging(modbusClient: ModbusRTU): Promise<TouDischargingValues> {
		const holdingRegisters1 = await this.readHoldingRegisters(modbusClient, 3, 2)
		//const holdingRegisters2 = await this.readHoldingRegisters(modbusClient, 18, 1) // Output Volt Type 230 110 etc
		const holdingRegisters3 = await this.readHoldingRegisters(modbusClient, 37, 1)	// Battery Low to Utility
		//const holdingRegisters4 = await this.readHoldingRegisters(modbusClient, 82, 1) // Battery Low Cut-off
		
        const { data: data1 } = holdingRegisters1
        //const { data: data2 } = holdingRegisters2
		const { data: data3 } = holdingRegisters3
		//const { data: data4 } = holdingRegisters4

        // TODO review why this is saved to class scoped variable and returned from a private function
        this.touDischargingValues = {
            batLowToUtiVolt: data3[0],
            utiOutStart: data1[0] >> 8,            
            utiOutEnd: data1[1] >> 8            
        }

        return this.touDischargingValues
    }

    private async getTime(modbusClient: ModbusRTU): Promise<TimeValues> {
        const holdingRegisters = await this.readHoldingRegisters(modbusClient, 45, 6)

        const { data } = holdingRegisters

        return {
            year: data[0],
            month: data[1],
            day: data[2],
            hour: data[3],
            minute: data[4],
            second: data[5]
        }
    }

    public async sendCommand(modbusClient: ModbusRTU, commandString: string): Promise<ControlData | void> {
        const command: Command = JSON.parse(commandString)

        switch (command.command) {
            case "setTouCharging":
                console.log(`${logDate()} Received Set TOU Charging command`)
                return await this.setTouCharging(modbusClient)
            case "getTouCharging":
                console.log(`${logDate()} Received Get TOU Charging command`)
                return {
                    subTopic: "touCharging",
                    values: await this.getTouCharging(modbusClient)
                }
            case "setTouDischarging":
                console.log(`${logDate()} Received Set TOU Discharging command`)
                return await this.setTouDischarging(modbusClient)
            case "getTouDischarging":
                console.log(`${logDate()} Received Get TOU Discharging command`)
                return {
                    subTopic: "touDischarging",
                    values: await this.getTouDischarging(modbusClient)
                }
            case "getTime":
                console.log(`${logDate()} Received Get Time command`)
                return {
                    subTopic: "time",
                    values: await this.getTime(modbusClient)
                }
            default:
                throw `Unknown command: ${command.command}`
        }
    }

    private parseInputRegisters(inputRegisters: ReadRegisterResult) {
        const { data } = inputRegisters

        const statusMap = {
            0: 'Standby',
			1: 'PV an Grid Combine Discharge',
			2: 'Discharge',
			3: 'Fault',
			4: 'Flash',
			5: 'PV charge',
			6: 'AC charge',
			7: 'Combine charge',
			8: 'Combine charge and Bypass',
			9: 'PV charge and Bypass',
			10: 'AC charge and Bypass',
			11: 'Bypass',
			12: 'PV charge and Discharge'
        }

        const errorMap = {
            2: 'Over Temperature',
			3: 'Bat Voltage High',
			5: 'Output short',
			6: 'Output voltage high',
			7: 'Over Load',
			8: 'Bus voltage high',
			9: 'Bus start fail',
			51: 'over current',
			52: 'Bus voltage low',
			53: 'inverter softstart fail',
			56: 'battery open',
			58: 'output voltage low',
			60: 'negtive power',
			61: 'PV voltage high',
			62: 'SCI com error',
			80: 'can fault',
			81: 'host loss'
        }

        return {
            inverterStatus: statusMap[data[0]] || data[0], // Status from map above or the numeric value
            ppv: (data[3] << 16 | data[4]) / 10.0, // Combined PV power (W) ToDo - check if necessary for spf5000, same with ppv1
            vpv1: data[1] / 10.0, // PV1 voltage (V) 
            ppv1: (data[3] << 16 | data[4]) / 10.0, // PV1 power (W)
            vpv2: data[2] / 10.0, // PV2 voltage (V)
            ppv2: (data[5] << 16 | data[6]) / 10.0, // PV2 power (W)
            vgrid: data[20] / 10.0, // Grid voltage (V)
            epvToday: ((data[48] << 16 | data[49]) + (data[52] << 16 | data[53])) / 10.0, // Combined PV energy today (kWH) (achieved by adding PV1 and PV2)
            epvTotal: ((data[50] << 16 | data[51]) + (data[54] << 16 | data[55]))/ 10.0, // Combined PV energy total (kWH)
            inverterTemperature: data[25] / 10.0, //°C
            inverterError: errorMap[data[40]] || data[40],

			pDischarge: (data[73] << 16 | data[74]) / 10.0, // Battery discharge power (W)
            pCharge: (data[77] << 16 | data[78]) / 10.0, // Battery charge power (W)
            soc: data[18], // Battery state of charge (%)
            pImport: (data[36] << 16 | data[37]) / 10.0, // Import power (W) - AC Charge Watt
            pExport: (data[69] << 16 | data[70]) / 10.0, // Export power (W)
            pLoad: (data[69] << 16 | data[70]) / 10.0, // Load (consumption) power (W) - ToDo: identify registry for this data and difference to @pExport
			eImportToday: (data[48] << 16 | data[49]) / 10.0, // Import energy today (kWh)
            eImportTotal: (data[50] << 16 | data[51]) / 10.0, // Import energy total (kWh)
            eExportToday: (data[85] << 16 | data[86]) / 10.0, // Export energy today (kWh) - ToDo: Verify if this registers are correct
            eExportTotal: (data[87] << 16 | data[88]) / 10.0, // Export energy total (kWh) - ToDo: Verify if this registers are correct
			eDischargeToday: (data[60] << 16 | data[61]) / 10.0, // Battery discharge energy today (kWh)
			eDischargeTotal: (data[62] << 16 | data[63]) / 10.0, // Battery discharge energy total (kWh)
			eChargeToday: (data[60] << 16 | data[61]) / 10.0, // Battery charge energy today (kWh) - ToDo - identify registries with this data
            eChargeTotal: (data[62] << 16 | data[63]) / 10.0, // Battery charge energy total (kWh) - ToDo - identify registries with this data
			eLoadToday: (data[64] << 16 | data[65]) / 10.0, // Load energy today (kWh)
            eLoadTotal: (data[66] << 16 | data[67]) / 10.0, // Load energy total (kWh)
        }
    }
    
}
