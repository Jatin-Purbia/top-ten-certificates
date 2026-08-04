# Approved certificate field map

The supplied `assets/certificate-demo.jpeg` contains these personalised blanks:

| Artwork text | Application source | Entered by admin | Publicly requested |
| --- | --- | --- | --- |
| बाल प्रश्नोत्तरी क्रमांक | Result cycle `resultNumber` | On the result cycle | No |
| अंक | Candidate `score` | Yes | No |
| श्री/सुश्री | Candidate `nameHindi` | Yes | No |
| पुत्र/पुत्री श्री | Candidate `guardianName` | Yes | No |
| कक्षा | Candidate `className` | Yes | No |
| आयु | Candidate `age` | Yes | No |
| स्थान | Candidate `rank` | Yes | No |
| दिनांक | Candidate `resultDate` | Yes | No |

The organisation name, address, registration number, logo, certificate title,
editor names, and supplied signatures are static approved artwork and must not
be replaced with candidate data.

Candidate retrieval uses the unique participant/reference ID plus a random
one-time-disclosed private claim code. A mobile number is not part of the
certificate and is not collected merely as an authentication factor. This
avoids unnecessary personal data while providing stronger access control than
a phone number alone. Certificate number remains an internal identifier and PDF
filename/metadata value; it is not placed over the template's registration
number.
