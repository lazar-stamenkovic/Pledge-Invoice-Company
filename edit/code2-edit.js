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
  const line_items_string = event.inputFields['line_items'];
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

  const line_items = JSON.parse(line_items_string)
  if (!line_items || !line_items.length) {
    throw Error('no line items')
  }
  const lineItemId = line_items[0].id

/***** END ******** Variables ***************/


  /******************************/
  /****** Get Line Item Detail ******/
  /******************************/

  const line_item = await new Promise((resolve, reject) => {
    let p = 'properties';
    let query = `${p}=name&${p}=price&${p}=status&${p}=class&${p}=netsuite_item_internal_id&${p}=netsuite_invoice_id&${p}=department&${p}=netsuite_internal_id&${p}=invoice_number&${p}=due_date&${p}=quantity`;

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
        try {
          let properties = JSON.parse(body).properties;
          resolve(properties)
        } catch(e) {
          console.error('failed to parse line item data')
          reject(e)
        }
      });
    });
    req.end();
  });

  /******************************/
  /****** Create Netsuit Invoice ******/
  /******************************/
  const BaseURL = 'https://4147491-sb1.suitetalk.api.netsuite.com/services/rest/record/v1/invoice';
  const AuthorizationHeader = ns_auth('POST', BaseURL);

  let li_id = line_item.hs_object_id;
  let li_qty = parseFloat(line_item.quantity);
  let li_name = line_item.name;
  let li_amount = parseFloat(line_item.price);
  let li_netsuite_item_internal_id = line_item.netsuite_item_internal_id;
  let li_netsuite_internal_id = line_item.netsuite_internal_id;
  let li_netsuite_invoice_id = line_item.netsuite_invoice_id;
  let li_invoice_number = line_item.invoice_number;
  let li_class = line_item.class;
  let li_department = line_item.department;
  let li_status = line_item.status;
  let li_due_date = line_item.due_date;
  let totalPrice = 0;
  totalPrice = calculateTotalPrice(line_item.price, line_item.quantity);

  let netSuiteDepartmentId = mapDepartment(li_department);
  let netSuiteClassId = mapClass(li_class);

  //

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

  const res = await new Promise((resolve) => {
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
        var get_ns_cust_id_body = Buffer.concat(get_ns_cust_id_chunks);
        resolve(get_ns_cust_id_body.toString())
      });
    });
    get_ns_cust_id_req.write(JSON.stringify({properties: {netsuite_internal_id: ns_lineitem_id }}));
    get_ns_cust_id_req.end();
  })
  callback({ outputFields: { ns_lineitem_id, hubspot_lineitem_id:  lineItemId} });
}
