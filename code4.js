const crypto = require('crypto');
const querystring = require('querystring');
const request = require('request');
const axios = require('axios');
const http = require("https");

function extractNSrecordId(url) {
    // Split the URL by slashes
    const parts = url.split('/');
    // Get the last part, which should be the customer ID
    const recordId = parts[parts.length - 1];

    // Validate if the extracted value is a numeric ID
    if (!recordId || isNaN(recordId)) {
        console.error("Invalid URL format. Unable to extract a valid customer ID.");
        return null;
    }

    return recordId;
}

function ns_auth(method,path){

   /**********Netsuitet***********/
  const BaseURL = `https://4147491-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/${path}`;
  const BaseURLEncoded = encodeURIComponent(BaseURL);

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


  const netsuite_invoice_number = event.inputFields['netsuite_invoice_number'];
  const dealname = event.inputFields['dealname'];
  const dealId = event.inputFields['hs_object_id'];
  const hubspot_internal_id = dealId;
  const department = event.inputFields['department'];
  const classDeal = event.inputFields['fund'];
  const primary_company_netsuite_id = event.inputFields['primary_company_netsuite_id'];
  const invoice_number = event.inputFields['invoice_number'];
  const netsuite_sales_order_id = event.inputFields['netsuite_sales_order_id'];
  const hubspot_owner_id = event.inputFields['hubspot_owner_id'];
  const billing_street_address_1 = event.inputFields['billing_street_address_1'];
  const billing_city = event.inputFields['billing_city'];
  const billing_state = event.inputFields['billing_state'];
  const billing_zip = event.inputFields['billing_zip'];



  /******************************/
  /****** Authentification ******/
  /******************************/

  /************HubSpot***********/
  const accessToken = process.env.accessToken;
  //console.log(accessToken);


 // console.log(dealId);

  const line_items_options = {
    'method': 'GET',
    'url': `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/line_items`,
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  };
  request(line_items_options, function (error, response) {
    if (error) throw new Error(error);
    const lineItems = JSON.parse(response.body).results;
    //console.log(lineItems)
    for (let lineItem of lineItems) {


       let lineItemId = lineItem.id;
      let p = 'properties';
      let query = `${p}=name&${p}=price&${p}=status&${p}=class&${p}=netsuite_invoice_id&${p}=department&${p}=netsuite_internal_id&${p}=invoice_number&${p}=due-date&${p}=quantity`;

      var options = {
        "method": "GET",
        "hostname": "api.hubapi.com",
        "port": null,
        "path": `/crm/v3/objects/line_items/${lineItemId}?${query}&archived=false`,
        "headers": {
          "accept": "application/json",
          'Authorization': `Bearer ${accessToken}`
        }
      };

      var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
          chunks.push(chunk);
        });

        res.on("end", function () {
          var body = Buffer.concat(chunks);
         // console.log( JSON.parse(body) );

          let line_item = JSON.parse(body).properties;

          let li_id = line_item.hs_object_id;


          let li_netsuite_internal_id = line_item.netsuite_internal_id;
          console.log(li_netsuite_internal_id )






                   let li_netsuite_invoice_id = line_item.netsuite_invoice_id;
          let li_invoice_number = line_item.invoice_number;

          	let get_ns_cust_id = {
              "method": "PATCH",
              "hostname": "api.hubapi.com",
              "port": null,
              "path": `/crm/v3/objects/line_items/${li_id}`,
              "headers": {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": `Bearer ${accessToken}`
              }
            };
            let get_ns_cust_id_req = http.request(get_ns_cust_id, function (get_ns_cust_id_res) {
              var get_ns_cust_id_chunks = [];

              get_ns_cust_id_res.on("data", function (chunk) {
                get_ns_cust_id_chunks.push(chunk);
              });

              get_ns_cust_id_res.on("end", function () {
                var get_ns_cust_id_body = Buffer.concat(chunks);
               // console.log('TEST 1: ' + get_ns_cust_id_body.toString());
              });
            });

            const ns_path = `invoice/${li_netsuite_internal_id}`;
           	const AuthorizationHeader = ns_auth('GET', ns_path);
            const ns_invoice_options = {
            'method': 'GET',
            'url': `https://4147491-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/${ns_path}`,
            'headers': {
              'Content-Type': 'application/json',
              'Authorization': AuthorizationHeader
            }
          };

          request(ns_invoice_options, function (error, ns_invoice_response) {
            if (error) throw new Error(error);
             //console.log( ns_invoice_response.body)
           // console.log( JSON.stringify(JSON.parse(ns_invoice_response.body).id, null, 2) )

              let invId = JSON.parse(ns_invoice_response.body).tranId;
	 			console.log('INV:  ' + invId);


             get_ns_cust_id_req.write(JSON.stringify({properties:
                                                      {
                                                        netsuite_invoice_id: invId,
                                                        invoice_number:invId
                                                      }
                                                     }));

                callback({
              outputFields: {
                notification: 'Invoice number has been added'
              }
            });
            get_ns_cust_id_req.end();



          });





       });
      });

      req.end();

    }

  });

}
