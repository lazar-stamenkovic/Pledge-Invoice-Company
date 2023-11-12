const http = require("https");
const axios = require('axios');

function httpGet(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString());
      });
    });
    req.on('error', (error) => {
      reject(error);
    });
    req.end();
  });
}
async function getOwnerFullName(ownerId, accessToken) {
  try {
    const response = await axios.get(
      `https://api.hubapi.com/crm/v3/owners/?idProperty=id&archived=false`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const owners = response.data.results;
    const owner = owners.find(o => o.id === ownerId);
    if (owner) {
      const fullName = owner.firstName + ' ' + owner.lastName;
      return fullName;
    } else {
      console.log('Owner not found');
      return null;
    }

  } catch (error) {
    console.error('Error:', error);
    return null;
  }
}
async function getCompanyDetails(companyId, accessToken) {
  return new Promise((resolve, reject) => {
    const params = `properties=ns_internal_id&archived=false`;
    const options = {
      method: "GET",
      hostname: "api.hubapi.com",
      port: null,
      path: `/crm/v3/objects/company/${companyId}?${params}`,
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    };

    const req = http.request(options, (res) => {
      let chunks = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const companyData = JSON.parse(body).properties;
        const ns_id = companyData.ns_internal_id;

        resolve(ns_id);
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
async function getDealAssociations(dealId, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      method: "GET",
      hostname: "api.hubapi.com",
      port: null,
      path: `/crm/v3/objects/deals/${dealId}/associations/company`,
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    };

    const req = http.request(options, (res) => {
      let chunks = [];

      res.on("data", (chunk) => {
        chunks.push(chunk);
      });

      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const dealData = JSON.parse(body);
        const companyId = dealData.results[0].id;
        resolve(  companyId );
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}

exports.main = async (event, callback) => {

    /************* Variables ***************/

  const accessToken = process.env.accessToken;
  const dealId = event.inputFields['hs_object_id'];

  /***** END ******** Variables ***************/

  /* Get Owner Name */
  const ownerId = event.inputFields['hubspot_owner_id'];
  const ownerFullName = await getOwnerFullName(ownerId, accessToken);

  const companyId = await getDealAssociations(dealId, accessToken);
  const ns_id = await getCompanyDetails(companyId, accessToken);




   try {


    const options = {
      method: 'GET',
      hostname: 'api.hubapi.com',
      port: null,
      path: `/crm/v3/objects/deals/${dealId}/associations/line_items`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
    };

    const response = await httpGet(options);
    const lineItems = JSON.parse(response).results;
    let lineItemIds = [];

    for (let lineItem of lineItems) {
      console.log(lineItem.id);
      lineItemIds.push({id: lineItem.id});
    }

    // Here you can use lineItemIds and nsId as needed

     callback({
       outputFields: {
         line_items: lineItemIds,
         ns_id: ns_id,
         comoanyId: companyId,
         owner_full_name: ownerFullName
       }
     });

  } catch (error) {
    console.error('Error:', error);
    callback({
      error: error.message,
    });
  }


}
