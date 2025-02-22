const dns = require("dns").promises;
const express = require("express");
const isValidDomain = require("is-valid-domain");

const host = process.env.DNSLINK_API_HOSTNAME || "0.0.0.0";
const port = Number(process.env.DNSLINK_API_PORT) || 3100;

const server = express();

const dnslinkNamespace = "skynet-ns";
const sponsorNamespace = "skynet-sponsor-key";
const dnslinkRegExp = new RegExp(`^dnslink=/${dnslinkNamespace}/.+$`);
const sponsorRegExp = new RegExp(`^${sponsorNamespace}=[a-zA-Z0-9]+$`);
const dnslinkSkylinkRegExp = new RegExp(`^dnslink=/${dnslinkNamespace}/([a-zA-Z0-9_-]{46}|[a-z0-9]{55})`);
const hint = `valid example: dnslink=/${dnslinkNamespace}/3ACpC9Umme41zlWUgMQh1fw0sNwgWwyfDDhRQ9Sppz9hjQ`;
server.get("/dnslink/:name", async (req, res) => {
  const success = (response) => res.json(response);
  const failure = (message) => res.status(400).send(message);

  if (!isValidDomain(req.params.name)) {
    return failure(`"${req.params.name}" is not a valid domain`);
  }

  let domainParts = req.params.name.split(".");

  while (2 <= domainParts.length) {
    const lookup = `_dnslink.${domainParts.join(".")}`;
    let addresses = [];
    try {
      addresses = await dns.resolveTxt(lookup);
    } catch (e) {
      domainParts.shift();
      continue;
    }

    if (addresses.length === 0) {
      domainParts.shift();
      continue;
    }

    const records = addresses.flat();
    const dnslinks = records.filter((record) => dnslinkRegExp.test(record));

    if (dnslinks.length === 0) {
      domainParts.shift();
      continue;
    }

    if (dnslinks.length > 1) {
      return failure(`Multiple TXT records with valid skynet dnslink found for ${lookup}, only one allowed`);
    }

    const [dnslink] = dnslinks;
    const matchSkylink = dnslink.match(dnslinkSkylinkRegExp);

    if (!matchSkylink) {
      return failure(`TXT record with skynet dnslink for ${lookup} contains invalid skylink - ${hint}`);
    }

    const skylink = matchSkylink[1];

    // check if _dnslink records contain skynet-sponsor-key entries
    const sponsors = records.filter((record) => sponsorRegExp.test(record));

    if (sponsors.length > 1) {
      return failure(`Multiple TXT records with valid sponsor key found for ${lookup}, only one allowed`);
    }

    if (sponsors.length === 1) {
      // extract just the key part from the record
      const sponsor = sponsors[0].substring(sponsors[0].indexOf("=") + 1);

      console.log(`${req.params.name} => ${skylink} | sponsor: ${sponsor}`);

      return success({ skylink, sponsor });
    }

    console.log(`${req.params.name} => ${skylink}`);

    return success({ skylink });
  }

  return failure(`No TXT record found for _dnslink.${req.params.name}`);
});

server.listen(port, host, (error) => {
  if (error) throw error;

  console.info(`Server listening at http://${host}:${port}`);
});
