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
function calculateTotalPrice(netPrice, quantity) {
  return (parseFloat(netPrice) * parseInt(quantity)).toFixed(2);
}
/*** If in Netsuite this prorperty or any related configuration to this has changed
it will break the code. Alert client to always notify if any changes has been made in their system ****/
function mapDepartment(hubSpotDepartment) {
  const departmentMapping = {
    'Program': '5',
    'Supply Chain': '13',
    'Capital Campaign': '16',
    'Finance': '14',
    'Development': '7',
    'Volunteer': '15'
  };

  return departmentMapping[hubSpotDepartment];
}
function mapClass(hubSpotClass) {
  const classMapping = {
    'Unrestricted Funds': '1',
    'Temporarily Restricted Funds': '2',
    'Temporarily Restricted Funds - Capital Campaign': '436'
  };

  return classMapping[hubSpotClass];
}

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

  const accessToken = process.env.accessToken;
  const dealId = event.inputFields['hs_object_id'];

  const netsuite_invoice_number = event.inputFields['netsuite_invoice_number'];
  const dealname = event.inputFields['dealname'];

  /* Foreign custom code Variable */
  const nsId = event.inputFields['ns_id'];
  const li_ids_string = event.inputFields['line_items'];
  const owner_full_name = event.inputFields['owner_full_name'];
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

  try {
    const li_ids = JSON.parse(li_ids_string)
    if (!li_ids || !li_ids.length) {
      throw Error('no line items')
    }
    var options = {
      "method": "POST",
      "hostname": "api.hubapi.com",
      "port": null,
      "path": "/crm/v3/objects/line_items/batch/read?archived=false",
      "headers": {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": `Bearer ${accessToken}`
      }
    };
   	const line_items_detail = await new Promise((resolve, reject) => {
      var req = http.request(options, function (res) {
          var chunks = [];
          res.on("data", function (chunk) {
            chunks.push(chunk);
          });
          res.on("end", function () {
            var body = Buffer.concat(chunks);
            console.log(body.toString());
            try {
              const parsedData = JSON.parse(body.toString());
              if (!parsedData) {
                reject(`failed to get line item batch: ${body.toString()}`);
              }
              resolve(parsedData.results)
            } catch(e) {
              console.error(e);
              reject(e);
            }
          });
        });
      req.write(JSON.stringify({
        propertiesWithHistory: ['test'],
        inputs: li_ids,
        properties: ['name', 'quantity', 'price', 'status', 'class', 'department', 'netsuite_invoice_id', 'netsuite_internal_id', 'due_date', 'invoice_number', 'netsuite_item_internal_id']
      }));
      req.end();
    });
    if (!line_items_detail || !line_items_detail.length) {
      throw Error("failed to get line item detail")
    }
    const results = []
    for (line_item of line_items_detail) {
      const properties = line_item.properties
      let li_id = properties.hs_object_id;
      let li_qty = parseFloat(properties.quantity) || 0;
      let li_name = properties.name || '';
      let li_amount = parseFloat(properties.price) || 0;
      let li_netsuite_item_internal_id = properties.netsuite_item_internal_id || '';
      let li_netsuite_internal_id = properties.netsuite_internal_id || '';
      let li_netsuite_invoice_id = properties.netsuite_invoice_id || '';
      let li_invoice_number = properties.invoice_number || '';
      let li_class = properties.class;
      let li_department = properties.department;
      let li_status = properties.status;
      let li_due_date = properties.due_date;
      let totalPrice = 0;
      totalPrice = calculateTotalPrice(properties.price, properties.quantity);

      let netSuiteDepartmentId = mapDepartment(li_department) || '';
      let netSuiteClassId = mapClass(li_class) || '';

      const BaseURL = 'https://4147491-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/invoice';
  	  const AuthorizationHeader = ns_auth('POST', BaseURL);
	  const options = {
        method: 'POST',
        url: BaseURL,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': AuthorizationHeader
        },
        data: JSON.stringify({
          "class": {
            "id": netSuiteClassId
          },
          "department": {
            "id": netSuiteDepartmentId
          },
          "custbodyem_billto_address1_hubspot": billing_street_address_1,
          "custbodyem_billto_city_hubspot": billing_city,
          "custbodyem_billto_state_hubspot": billing_state,
          "custbodyem_billto_zip_hubspot": billing_zip,
          "custbodyem_deal_transaction_id": dealId,
          "custbodyem_item_transaction_id": li_id,
          "custbodyem_salesrep_hubspot": owner_full_name,
          "dueDate": li_due_date,
          "entity": {
            "id": nsId
          },
          "status": {
            "id": "Paid In Full",
            "refName": "Paid In Full"
          },
          "subsidiary": {
            "id": "1",
            "refName": "Parent Company"
          },
          "tranId": li_invoice_number,
          "item": {
            "items": [
              {
                "amount": li_amount * li_qty,
                "item": {
                  "id":li_netsuite_item_internal_id
                },
                "quantity": li_qty
              }
            ]
          },
        })
      };
	  const ns_lineitem_id = await axios(options).then(response => {
        const ns_lineItemId = extractNSrecordId(response.headers.location);
        if (!ns_lineItemId) {
          console.error("Failed to extract customer ID from the provided URL.");
          throw Error('Failed to extract customer ID from the provided URL.')
        }
        return  ns_lineItemId
      })
	  results.push({
        line_item_id: li_id,
        ns_line_item_id: ns_lineitem_id
      })
    }
    const outputFields = {
      ns_line_item_results: results
    }
    callback({ outputFields: outputFields });
  } catch (e) {
    throw e
  }
}
