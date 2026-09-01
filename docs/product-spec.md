# Internal Operations Service Hub

## 1 problem / context:
What problem are we solving?

- Provide a hub place for employees to submit a request where they can track their request.
- It is better than trying all types of communication to request a service without knowing the request status.

## 2 actors/stakeholders:
who is involved?

- IT, HR, and finance teams should be involved in this type of hub.
- Employee: submits and tracks service requests, browses/searches for services
- Service Administrator (from IT/HR/Finance): maintains the list of available services.

## 3 functional requirements:
what must product do?

- Employees can submit a service request and view its current status.
- Service browsing and search by genre, the search engine returns filtered results.
- User authentication where users log in with username and password.


## 4 known facts:
what is definitely known?

- The product is an Internal Operations Service Hub.
- The hub is intended for internal company use.
- Employees will use the hub to request internal services.

## 5 Non functional Requirements:

- The system should remain reliable when receiving multiple requests from users.
- The hub should be reliable and always available.
- Ensuring security against data breaches by encrypting the transactions.

## 6.1 unknowns:
what is still unknown?

- Who is not authorized to access the hub.
- What authentication will be used.


## 6.2 assumptions: 
what assumptions did you make?

- Both admin and user can track their service requested.
- We assume that administrators have appropriate permissions to manage or monitor service requests.

## 7 Non-Goals
What are you deliberately not solving?

- The product will not replace existing company systems.
- The product will not provide services to customers.

## 8 Acceptance Criteria:
What are a few examples of correct behavior?

- Denied access for unauthorized users, or attempting to access restricted info.
- Given a user searches for a service, when the search is submitted, then the system returns matching filtered results.
