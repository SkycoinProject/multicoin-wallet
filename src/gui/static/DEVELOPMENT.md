# Development notes

This file contains notes about the procedures that have been used for performing frequent operations and other general
approaches that have been used in the code, which should be followed to maintain consistency and make the project more maintainable.

## Form validation

Normally, Forms are not validated using the prebuild validators Angular provide, but a custom validation function assigned to the form
via the `setValidators`. You can see examples of this in most forms, like in `CreateWalletFormComponent`, were the form is validated
by the `validateForm` function. Please, check the code to have a better idea about how each field is validated inside the function
and what is done when invalid values are found, the process is very similar in all forms. Some relevant things to take into account are:

- When there is an invalid value, the error message is saved in a var specifically made for that field.
- In the html code those vars are passed to the `appFormFieldError` directive, which takes care of showing the error in the UI.
- If there are errors, the confirm button should be disabled.

## Working forms

When the user uses a form to start a procedure and the procedure is not immediate, the confirmation button must be put in loading
state and a var called `working` is normally set to `true`. When the `working` var is `true`, all new request to process the data
must be ignored, which is something important top keep in mind because the procedure can be started by pressing the confirmation button,
pressing the `enter` key while in the last field and other situations. Also, while the `working` var is true all fields must be disabled.

## Submit forms

The user must be able to submit any form by pressing the confirmation button and by pressing the `Enter` key while the last field is
focused. The normal behavior of the web browsers when using a form and a submit button is to submit the form if the `Enter` key is
pressed while any field is focused, which is NOT the behavior of this app.

## Passwords

Use `DontsavepasswordDirective` in all password fields to prevent the web browser from showing password suggestions and prevent
potential security problems.
