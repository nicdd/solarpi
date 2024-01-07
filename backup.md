# SolarPi inverter backup utility

## Description
A simple script that reads the binary configuration values from the inverter and saves them to a file.
This is written to work with SPH or SPF5000 inverters only. It reads the USB device path from the options.json file 
so assumes that has been configured correctly. I have not written a restore utility; this backup utility is
aimed at testing and debugging SolarPi.

### Usage
If you have installed SolarPi using my install.sh script then these command line instructions should work for you:
1. Change to the directory that SolarPi is installed in:
    * cd /opt/solarpi
2. Stop SolarPi from running:
    * sudo systemctl stop solarpi
3. Run the backup script depending of your inverter model:
	* for SPH model:
    * sudo -u solarpi node dist/backupGrowattSPH.js
	* for SPF5000 model:
    * sudo -u solarpi node dist/backupGrowattSPF5000.js
4. Restart SolarPi
    * sudo systemctl start solarpi

The backup of the inverter values is now stored in the text file /opt/solarpi/growattbackup.txt

The contents of the file list the values from the inverter's Holding Registers and Input Registers.
