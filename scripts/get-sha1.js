const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.env.HOME + '/.expo/state.json', 'utf8'));
const sessionSecret = state.auth.sessionSecret;

async function getSHA1() {
  // Get the keystore from AndroidAppCredentials
  const query = `query {
    androidAppCredentials {
      byId(androidAppCredentialsId: "cccdfb30-6836-41e7-9826-14e81cd910bd") {
        id
        androidKeystoreFragment {
          id
          keyAlias
          md5CertificateFingerprint
          sha1CertificateFingerprint
          sha256CertificateFingerprint
        }
      }
    }
  }`;

  const resp = await fetch('https://api.expo.dev/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'expo-session': sessionSecret
    },
    body: JSON.stringify({ query })
  });

  const data = await resp.json();

  if (data.errors) {
    // Try with app-level query using androidAppBuildCredentialsList
    const query2 = `query {
      app {
        byFullName(fullName: "@testerxxx/afterswitch") {
          id
          androidAppCredentials {
            id
            androidAppBuildCredentialsList {
              id
              androidKeystore {
                id
                keyAlias
                md5CertificateFingerprint
                sha1CertificateFingerprint
                sha256CertificateFingerprint
              }
            }
          }
        }
      }
    }`;

    const resp2 = await fetch('https://api.expo.dev/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'expo-session': sessionSecret
      },
      body: JSON.stringify({ query: query2 })
    });

    const data2 = await resp2.json();
    console.log(JSON.stringify(data2, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

getSHA1().catch(console.error);
