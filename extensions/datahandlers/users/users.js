// ############################# users.js ##############################
// This extension handles users/viewers data. ie a place to store channel points etc
// ---------------------------- creation --------------------------------------
// Author: Silenus aka twitch.tv/OldDepressedGamer
// GitHub: https://github.com/SilenusTA/streamer
// Date: 09-Mar-2023
// ============================================================================

// ============================================================================
//                           IMPORTS/VARIABLES
// ============================================================================
import * as logger from "../../../backend/data_center/modules/logger.js";
import sr_api from "../../../backend/data_center/public/streamroller-message-api.cjs";
import * as fs from "fs";
// these lines are a fix so that ES6 has access to dirname etc
import { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
// how many times we have attempted to connect on failure
let ServerConnectionAttempts = 0;

const localConfig = {
    OUR_CHANNEL: "USERS_CHANNEL",
    EXTENSION_NAME: "users",
    SYSTEM_LOGGING_TAG: "[EXTENSION]",
    DataCenterSocket: null,
    MaxServerConnectionAttempts: 20
};
const serverConfig = {
    extensionname: localConfig.EXTENSION_NAME,
    channel: localConfig.OUR_CHANNEL,
    demovar1: "on",  // example of a checkbox. "on" or "off"
    demotext1: "demo text", // example of a text field
};
let userData = [
    //{
    // ie.
    //    username: "", /* madatory */
    //    platform: "", /* madatory */
    //    firstseen: "",
    //    lastseen: ""
    //}
]

const OverwriteDataCenterConfig = false;

// ============================================================================
//                           FUNCTION: initialise
// ============================================================================
function initialise (app, host, port, heartbeat)
{
    try
    {
        localConfig.DataCenterSocket = sr_api.setupConnection(onDataCenterMessage, onDataCenterConnect,
            onDataCenterDisconnect, host, port);
    } catch (err)
    {
        logger.err(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".initialise", "config.DataCenterSocket connection failed:", err);
    }
}

// ============================================================================
//                           FUNCTION: onDataCenterDisconnect
// ============================================================================
/**
 * Disconnection message sent from the server
 * @param {String} reason 
 */
function onDataCenterDisconnect (reason)
{
    logger.log(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterDisconnect", reason);
}
// ============================================================================
//                           FUNCTION: onDataCenterConnect
// ============================================================================
/**
 * Connection message handler
 * @param {*} socket 
 */
function onDataCenterConnect (socket)
{
    logger.log(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterConnect", "Creating our channel");
    if (OverwriteDataCenterConfig)
    {
        SaveConfigToServer();
        SaveDataToServer();
    }
    sr_api.sendMessage(localConfig.DataCenterSocket,
        sr_api.ServerPacket("RequestConfig", serverConfig.extensionname));
    sr_api.sendMessage(localConfig.DataCenterSocket,
        sr_api.ServerPacket("RequestData", localConfig.EXTENSION_NAME));
    sr_api.sendMessage(localConfig.DataCenterSocket,
        sr_api.ServerPacket("CreateChannel", localConfig.EXTENSION_NAME, localConfig.OUR_CHANNEL)

    );

    /*    sr_api.sendMessage(localConfig.DataCenterSocket,
            sr_api.ServerPacket("JoinChannel", localConfig.EXTENSION_NAME, "STREAMLABS_ALERT")
        );
    */
}
// ============================================================================
//                           FUNCTION: onDataCenterMessage
// ============================================================================
/**
 * receives message from the socket
 * @param {data} server_packet 
 */
function onDataCenterMessage (server_packet)
{
    //logger.log(localConfig.SYSTEM_LOGGING_TAG + config.EXTENSION_NAME + ".onDataCenterMessage", "message received ", server_packet);

    if (server_packet.type === "ConfigFile")
    {
        if (server_packet.data != "" && server_packet.to === serverConfig.extensionname)
        {
            for (const [key, value] of Object.entries(serverConfig))
                if (key in server_packet.data)
                    serverConfig[key] = server_packet.data[key];
            SaveConfigToServer();

        }
    }
    else if (server_packet.type === "DataFile")
    {
        if (server_packet.data != "")
        {

            // check it is our data
            if (server_packet.to === serverConfig.extensionname)
                userData = server_packet.data
            SaveDataToServer();
        }
    }
    else if (server_packet.type === "ExtensionMessage")
    {
        let extension_packet = server_packet.data;
        if (extension_packet.type === "RequestAdminModalCode")
        {
            // adminmodel code not yet updated
            //SendAdminModal(extension_packet.from);

        }
        else if (extension_packet.type === "AdminModalData")
        {
            if (extension_packet.data.extensionname === serverConfig.extensionname)
            {
                serverConfig.demovar1 = "off";
                for (const [key, value] of Object.entries(extension_packet.data))
                    serverConfig[key] = value;
                SaveConfigToServer();
            }
        }
        else if (extension_packet.type === "UpdateUserData")
        {
            if (server_packet.to === localConfig.EXTENSION_NAME)
            {
                let userfound = false;
                // extension data will be a single user item.
                let newdata = extension_packet.data
                let x = 0
                userData.every(element =>
                {
                    //console.log("looping:", element, ":", x++)
                    // EXISTING USER
                    if (element.username === newdata.username
                        && element.platform === newdata.platform)
                    {
                        newdata.lastseen = Date.now()
                        for (const [key, value] of Object.entries(extension_packet.data))
                            element[key] = value;
                        userfound = true;
                        return false; // break out of loop

                    }
                    return true // continue looping
                })
                //console.log("post loop:", userfound)
                if (userfound === false)
                {
                    // NEW USER
                    if (newdata.username && newdata.platform)
                    {
                        newdata.firstseen = Date.now()
                        newdata.lastseen = Date.now()
                        userData.push(extension_packet.data)
                    }
                    else
                        logger.warn(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterMessage", "UpdateUserData missing data ", newdata);
                }
                SaveDataToServer();
            }
        }
        else
            logger.log(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterMessage", "received unhandled ExtensionMessage ", server_packet);

    }
    else if (server_packet.type === "UnknownChannel")
    {
        if (ServerConnectionAttempts++ < localConfig.MaxServerConnectionAttempts)
        {
            logger.info(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterMessage", "Channel " + server_packet.data + " doesn't exist, scheduling rejoin");
            setTimeout(() =>
            {
                sr_api.sendMessage(localConfig.DataCenterSocket,
                    sr_api.ServerPacket(
                        "JoinChannel", localConfig.EXTENSION_NAME, server_packet.data
                    ));
            }, 5000);
        }
    }
    /*    else if (server_packet.type === "ChannelData")
        {
            if (server_packet.dest_channel === "STREAMLABS_ALERT")
                process_streamlabs_alert(server_packet);
            else
                logger.log(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterMessage", "received message from unhandled channel ", server_packet.dest_channel);
        }
    */
    else if (server_packet.type === "InvalidMessage")
    {
        logger.err(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".onDataCenterMessage",
            "InvalidMessage ", server_packet.data.error, server_packet);
    }
    else if (server_packet.type === "LoggingLevel")
    {
        logger.setLoggingLevel(server_packet.data)
    }
    else if (server_packet.type === "ChannelJoined"
        || server_packet.type === "ChannelCreated"
        || server_packet.type === "ChannelLeft"
    )
    {

        // just a blank handler for items we are not using to avoid message from the catchall
    }
    // ------------------------------------------------ unknown message type received -----------------------------------------------
    else
        logger.warn(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME +
            ".onDataCenterMessage", "Unhandled message type", server_packet.type);
}

// ============================================================================
//                           FUNCTION: process_streamlabs_alert
// ============================================================================
/**
 * Just a function to log data from the streamlabs api messages
 * @param {String} server_packet 
 */
/*
function process_streamlabs_alert (server_packet)
{
    // for this type of message we need to know the format of the data packet. 
    //and do something usefull with it 
    logger.err(localConfig.SYSTEM_LOGGING_TAG + localConfig.EXTENSION_NAME + ".process_streamlabs_alert", "empty function");

}
*/
// ===========================================================================
//                           FUNCTION: SendAdminModal
// ===========================================================================
/**
 * send some modal code to be displayed on the admin page 
 * @param {String} tochannel 
 */
function SendAdminModal (tochannel)
{
    fs.readFile(__dirname + "/usersadminmodal.html", function (err, filedata)
    {
        if (err)
            throw err;
        else
        {
            let modalstring = filedata.toString();
            for (const [key, value] of Object.entries(serverConfig))
            {
                if (value === "on")
                    modalstring = modalstring.replace(key + "checked", "checked");
                else if (typeof (value) == "string")
                    modalstring = modalstring.replace(key + "text", value);
            }
            sr_api.sendMessage(localConfig.DataCenterSocket,
                sr_api.ServerPacket(
                    "ExtensionMessage", // this type of message is just forwarded on to the extension
                    localConfig.EXTENSION_NAME,
                    sr_api.ExtensionPacket(
                        "AdminModalCode", // message type
                        localConfig.EXTENSION_NAME, //our name
                        modalstring,// data
                        "",
                        tochannel,
                        localConfig.OUR_CHANNEL
                    ),
                    "",
                    tochannel // in this case we only need the "to" channel as we will send only to the requester
                ))
        }
    });
}

// ============================================================================
//                           FUNCTION: SaveConfigToServer
// ============================================================================
/**
 * Sends our config to the server to be saved for next time we run
 */
function SaveConfigToServer ()
{
    sr_api.sendMessage(localConfig.DataCenterSocket, sr_api.ServerPacket(
        "SaveConfig",
        localConfig.EXTENSION_NAME,
        serverConfig))
}
// ============================================================================
//                           FUNCTION: SaveDataToServer
// ============================================================================
// Desription:save data on backend data store
// Parameters: none
// ----------------------------- notes ----------------------------------------
// none
// ===========================================================================
function SaveDataToServer ()
{
    sr_api.sendMessage(localConfig.DataCenterSocket,
        sr_api.ServerPacket(
            "SaveData",
            localConfig.EXTENSION_NAME,
            userData));
}
// ============================================================================
//                                  EXPORTS
// Note that initialise is mandatory to allow the server to start this extension
// ============================================================================
export { initialise };
