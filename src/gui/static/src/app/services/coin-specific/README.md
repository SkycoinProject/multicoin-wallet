# Coin Specific Operators

This folder contains classes which are in charge of performing most of the general operations which would normally be
in a service but are dependant on the currently selected coin. Those clases are called "operators" in the context of
this applications simply as a way to identify them and make clear their purpose.

<!-- MarkdownTOC autolink="true" bracket="round" levels="1,2,3" -->

- [Purpose of the operators](#purpose-of-the-operators)
- [Contents of this folder](#contents-of-this-folder)
- [Considerations about the operators](#considerations-about-the-operators)

<!-- /MarkdownTOC -->

## Purpose of the operators

This app has several services which allows to perform multiple operations which are different depending on the blockchain
type the currently selected coin uses. Having the code for each blockchain type in a separate operator instead of including it
directly in the service has the obvious advantage of allowing to create a much more maintanable code, but also helps when part of
the state of the services must be resetted after the active coin is changed: instead of having to reset most of the properties
of the services after the active coin is changed, which is not only tedious but also error prone, services can simply create a
new instance of the appropiate operator, which will come with a fresh state and will not touch any of the properties inside
the service.

## Contents of this folder

This folder contains several files with interfaces which the public functions and properties the operators must have. The
implementations must be added inside subfolders.

## Considerations about the operators

Every operator must work as a temporal helper instance, which can be created and destroyed at any moment if the user
decides to change the active coin. OperatorService is responsible for creating and deleting the operators as needed, so
the operators must not check the changes in the active coin and try to react to them.

When the active coin is changed the main app component removes all the content from the UI and creates it again after several
frames, giving time for the operators to be removed and created again without having the UI trying to interact with them and
ensuring that the new UI instances will use the services when the new operators are in place (not the ones corresponding to the
old coin).

It is important to keep in mind that removing the UI only gives protection agains race conditions to the UI
itself, it would be posible for the services and operators to continue running, which may be problematic. Because of that,
operators must not depend on services which depend on other oeprators. This is because an operator could take a lot of time to
complete an operation, specially when remote calls are involved. If the service is used only after a previous remote operation
is completed, the coin could have been changed at that moment, so calling the service will make the operation to be performed
for the new coin. Instead, just after being created, the operators must use OperatorService to get the set of operators active
at that very moment and use the requiered operators directly. This way, if the coin changes, the operator itself will continue
using the operator set it obtained when created.
