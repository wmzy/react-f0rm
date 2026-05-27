---
sidebar_position: 1
---

# Basic Form

```tsx
import { Form, Field } from 'react-f0rm';

export default function ContactForm() {
  return (
    <Form
      initialValues={{ name: '', email: '', message: '' }}
      onValidSubmit={(values) => {
        alert(JSON.stringify(values, null, 2));
      }}
    >
      <div>
        <label>Name</label>
        <Field name="name" required />
      </div>
      <div>
        <label>Email</label>
        <Field name="email" type="email" required />
      </div>
      <div>
        <label>Message</label>
        <Field name="message" as="textarea" required />
      </div>
      <button type="submit">Send</button>
    </Form>
  );
}
```
