const crypto = require('crypto');
const querystring = require('querystring');
const request = require('request');
const axios = require('axios');
const http = require("https");


function ns_auth(method,url){
  /**********Netsuitet***********/
  const BaseURLEncoded = encodeURIComponent(url);

  const TimeStamp = Math.floor(new Date().getTime() / 1000);
  const Nonce = Math.floor(Math.random() * (99999999 - 9999999) + 9999999).toString();
  const ConsumerKey = process.env.CONSUMER_KEY;
  const ConsumerSecret = process.env.CONSUMER_SECRET;
  const TokenID = process.env.TOKEN_ID;
  const TokenSecret = process.env.TOKEN_SECRET;

  // Concatenating and URL Encoding Parameters
  const ConcatenatedParameters = querystring.stringify({
    oauth_consumer_key: ConsumerKey,
    oauth_nonce: Nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: TimeStamp,
    oauth_token: TokenID,
    oauth_version: '1.0',
  });
  const ConcatenatedParametersEncoded = encodeURIComponent(ConcatenatedParameters);

  // Prepare Signature
  const SignatureMessage = `${method}&${BaseURLEncoded}&${ConcatenatedParametersEncoded}`;

  // Creating Signature Key
  const SignatureKey = `${ConsumerSecret}&${TokenSecret}`;

  // Create Signature
  const signature = crypto.createHmac('sha256', SignatureKey)
  .update(SignatureMessage)
  .digest('base64');

  // URL Encode the Signature
  const SignatureEncoded = encodeURIComponent(signature);

  // Create Authorization
  const Realm = '4147491_SB1';
  const AuthorizationHeader = `OAuth realm="${Realm}",oauth_consumer_key="${ConsumerKey}",oauth_token="${TokenID}",oauth_signature_method="HMAC-SHA256",oauth_timestamp="${TimeStamp}",oauth_nonce="${Nonce}",oauth_version="1.0",oauth_signature="${SignatureEncoded}"`;
  //console.log(AuthorizationHeader)

  /******************************/
  /**** END Authentification ****/
  /******************************/
  return AuthorizationHeader;
}

exports.main = async (event, callback) => {
  const dealId = event.inputFields['hs_object_id'];
  const accessToken = process.env.accessToken;
  const ns_lineitem_id = event.inputFields['ns_lineitem_id'];
  const hubspot_lineitem_id = event.inputFields['hubspot_lineitem_id'];

  if (!ns_lineitem_id) {
    callback({
      outputFields: {
        invoice_successfully_created: 'no',
        notification: 'Invoice creation has been failed'
      }
    });
  }

  const url = `https://4147491-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/invoice/${ns_lineitem_id}`;
  const AuthorizationHeader = ns_auth('GET', url);
  const ns_invoice_options = {
    'method': 'GET',
    'url': url,
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': AuthorizationHeader
    }
  };
  try {
    const tran_id = await new Promise((resolve, reject) => {
      request(ns_invoice_options, function (error, ns_invoice_response) {
        if (error) reject(error);
        try {
          if (!ns_invoice_response || !ns_invoice_response.body) {
            reject('no find response body');
          }
          let invId = JSON.parse(ns_invoice_response.body).tranId;
          resolve(invId);
        } catch (e) {
          console.error(e);
          reject(e);
        }
      });
    });
    let get_ns_cust_id = {
      "method": "PATCH",
      "hostname": "api.hubapi.com",
      "port": null,
      "path": `/crm/v3/objects/line_items/${hubspot_lineitem_id}`,
      "headers": {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`
      }
    };
    const res = await new Promise((resolve, reject) => {
      let get_ns_cust_id_req = http.request(get_ns_cust_id, function (get_ns_cust_id_res) {
        var get_ns_cust_id_chunks = [];

        get_ns_cust_id_res.on("data", function (chunk) {
          get_ns_cust_id_chunks.push(chunk);
        });

        get_ns_cust_id_res.on("end", function () {
          var get_ns_cust_id_body = Buffer.concat(get_ns_cust_id_chunks);
          resolve(get_ns_cust_id_body.toString())
        });
      });
      get_ns_cust_id_req.write(JSON.stringify({properties: {
        netsuite_invoice_id: tran_id,
        invoice_number:tran_id,
        invoice_successfully_created: 'yes'
      }}));
      get_ns_cust_id_req.end();
    });
    callback({ outputFields: { notification: 'Invoice has been created', invoice_successfully_created: 'yes'}});
  } catch (e) {
    console.error(e);
    throw e;
  }
}
