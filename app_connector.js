const { HttpUtils } = require("quickwork-adapter-cli-server/http-library");

const app = {
  name: "Dropbox",
  alias: "dropbox",
  description: "Dropbox integration",
  version: "1",
  config: { authType: "oauth_2" },
  webhook_verification_required: false,
  internal: false,
  connection: {
    client_id: "fe20zg8rsd4lzw7",
    client_secret: "s98htyhj8eq6szx",
    redirect_uri: "https://proxy.quickwork.co.in/dropbox/code",
    base_uri: () => "https://api.dropboxapi.com",
    authorization: {
      type: "oauth_2",
      authorization_url: async (connection) => {
        const scope = "files.content.read files.metadata.read account_info.read "; 
        const url = `https://www.dropbox.com/oauth2/authorize?client_id=${app.connection.client_id}&redirect_uri=${app.connection.redirect_uri}&scope=${scope}&access_type=offline&response_type=code&prompt=consent&state=${connection.id}`;
        return { url: url };
      },      

      acquire: async (code, scope, state) => {
        try {
          const body = new URLSearchParams({
            code,
            grant_type: "authorization_code",
            redirect_uri: app.connection.redirect_uri,  
          }).toString();
      
          
          const encodedCredentials = Buffer.from(
            `${app.connection.client_id}:${app.connection.client_secret}`
          ).toString("base64");
      
          const headers = {
            Authorization: `Basic ${encodedCredentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          };
      
          const tokenURL = "https://api.dropboxapi.com/oauth2/token";
          const response = await HttpUtils.request(
            tokenURL,
            headers,
            null,
            HttpUtils.HTTPMethods.POST,
            body,
            HttpUtils.ContentTypes.FORM_URL_ENCODED
          );
      
          if (response.success === true) {
            const jsonResponse = JSON.parse(response.body);
            return HttpUtils.successResponse({
              accessToken: jsonResponse.access_token,
              expires: jsonResponse.expires_in,
              refreshToken: jsonResponse.refresh_token,
              identity: jsonResponse.account_id,
            });
          } else {
            return HttpUtils.errorResponse(response.body, response.statusCode);
          }
        } catch (error) {
          return HttpUtils.errorResponse(error.message);
        }
      },      

      refresh_on: [401],
      detect_on: "",
      credentials: (connection) => {
        return { Authorization: `Bearer ${connection.oauthToken.accessToken}` };
      },
    },
  },
  actions: {},
  triggers: {
    new_files: {
      description: "New Files/Folders",
      hint: "Trigger when a <b>new file or folder</b> is added via <b>Dropbox</b>",
      type: "poll",
  
      input_fields: () => [
        {
          key: "folderId",
          name: "Folder Path",
          hintText: "Select the folder",
          helpText: "Select a folder",
          required: true,
          type: "pickList",
          controlType: "select",
          isExtendedSchema: false,
          dynamicPickList: "folders",
        },
      ],
  
      execute: async (connection, input, nextPoll) => {
        try {
          if (nextPoll === undefined) nextPoll = new Date().toISOString();
      
          const url = `https://api.dropboxapi.com/2/files/list_folder`;
          const headers = {
            Authorization: `Bearer ${connection.oauthToken.accessToken}`,
            "Content-Type": "application/json",
          };
          const body = {
            path: input.folderId || "", 
            recursive: false,
            include_media_info: false,
            include_deleted: false,
            include_has_explicit_shared_members: false,
          };
      
          const response = await HttpUtils.request(url, headers, null, "POST", body);
      
          if (response.success === true) {
            let newEvents = [];
            let lastModifiedDate = nextPoll;
      
            if (response.body.entries.length !== 0) {
              let entries = response.body.entries;
      
              newEvents = entries
                .filter(
                  (item) =>
                    item["server_modified"] &&
                    new Date(item["server_modified"]) > new Date(nextPoll)
                )
                .map((item) => {
                  return {
                    id: item.id,
                    name: item.name,
                    path_display: item.path_display,
                    server_modified: item.server_modified,
                  };
                });
      
              if (newEvents.length > 0) {
                lastModifiedDate = newEvents[0]["server_modified"];
              }
      
              return HttpUtils.successResponse({
                events: newEvents, 
                nextPoll: lastModifiedDate, 
              });
            } else {
              return HttpUtils.successResponse({
                events: [], 
                nextPoll: new Date().toISOString(),
              });
            }
          } else {
            return HttpUtils.errorResponse(response.body, response.statusCode);
          }
        } catch (error) {
          console.log(error);
          return HttpUtils.errorResponse(error.message);
        }
      },      
  
      dedup: (item) => {
        return item.id;
      },
  
      output_fields: () => [
        { key: "id", type: "string", name: "ID", hintText: "File/Folder ID" },
        { key: "name", type: "string", name: "Name", hintText: "Name of the file or folder" },
        { key: "path_display", type: "string", name: "Path", hintText: "Path of the file or folder" },
        { key: "server_modified", type: "datetime", name: "Server Modified", hintText: "Date and time when the file was modified on the server" },
      ],
    },
  },  
  
  test: async (connection) => {
    try {
      const url = "https://api.dropboxapi.com/2/users/get_current_account";
      const headers = app.connection.authorization.credentials(connection);
  
      // console.log("Request URL:", url);
      // console.log("Request Headers:", headers);
  
      const response = await HttpUtils.request(
        url,
        headers,
        null, 
        HttpUtils.HTTPMethods.POST, 
        null, 
        HttpUtils.ContentTypes.JSON 
      );
  
      // console.log("Response Status Code:", response.statusCode);
      // console.log("Response Body:", response.body);
  
      if (response.success === true) {
        return HttpUtils.successResponse(response.body);
      } else {
        console.error("Error in API call:", response.errorMessage || response.body);
        return HttpUtils.errorResponse(response.errorMessage || response.body, response.statusCode);
      }
    } catch (error) {
      console.error("Error in test function:", error.message || error);
      return HttpUtils.errorResponse(error.message || error);
    }
  },
  
  objectDefinitions: {
    item: [
      {
        key: "id",
        required: false,
        type: "string",
        controlType: "text",
        name: "Id",
        hintText: "File/Folder ID",
        helpText: "Unique ID of the file or folder",
      },
      {
        key: "name",
        required: false,
        type: "string",
        controlType: "text",
        name: "Name",
        hintText: "Name of the file or folder",
        helpText: "Name of the new file or folder",
      },
      {
        key: "path_display",
        required: false,
        type: "string",
        controlType: "text",
        name: "Path",
        hintText: "File/Folder Path",
        helpText: "The path of the new file or folder",
      },
      {
        key: "server_modified",
        required: false,
        type: "datetime",
        controlType: "datetime",
        name: "Modified Date",
        hintText: "Server Modified Date",
        helpText: "The date and time the file or folder was modified on the server",
      },
    ],
  },
  
  pickLists: {
    folders: async (connection) => {
      try {
        const url = "https://api.dropboxapi.com/2/files/list_folder";
        const headers = {
          Authorization: `Bearer ${connection.oauthToken.accessToken}`,
          "Content-Type": "application/json",
        };
        const body = {
          path: "",
          recursive: false,
          include_media_info: false,
          include_deleted: false,
        };
  
        const response = await HttpUtils.request(url, headers, null, "POST", body);
  
        if (response.success === true) {
          const folderList = response.body.entries
            .filter((entry) => entry[".tag"] === "folder")
            .map((folder) => {
              return [folder.path_display, folder.id];
            });
  
          return HttpUtils.successResponse(folderList);
        } else {
          return HttpUtils.errorResponse(response.body, response.statusCode);
        }
      } catch (error) {
        return HttpUtils.errorResponse(error.message);
      }
    },
  },

  events: async (connection, field, pickListParams) => {
    try {
      let url = "https://api.dropboxapi.com/2/files/list_folder"; 
      let headers = {
        Authorization: `Bearer ${connection.oauthToken.accessToken}`,
        "Content-Type": "application/json",
      };

      let body = {
        path: pickListParams.path || "", 
        recursive: false, 
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
      };
  
      let response = await HttpUtils.request(url, headers, body);
  
      if (response.success === true) {
        let eventList = response.body.entries.map((item) => ({
          id: item.id,
          name: item.name,
          path: item.path_display,
        }));
  
        return HttpUtils.successResponse({
          events: eventList,
          nextPoll: new Date().toISOString(), 
        });
      } else {
        return HttpUtils.errorResponse(response.body, response.statusCode);
      }
    } catch (error) {
      return HttpUtils.errorResponse(error.message);
    }
  },

  
};
  
module.exports = app;