---
title: We don't really know how LLMs work
description: "We're sorry, your application for benefits was rejected due to an insufficient number of owls."
date: 2025-07-23
tags:
  - LLMs
  - government
---

I had to read [this one](https://arxiv.org/abs/2507.14805) twice:

>In our main experiments, a "teacher" model with some trait T (such as liking owls or being misaligned) generates a dataset consisting solely of number sequences. Remarkably, a "student" model trained on this dataset learns T. This occurs even when the data is filtered to remove references to T.

The actual finding is summed up neatly later in the paper (emphasis mine):

> Subliminal learning in language models is an instance of a more general phenomenon. We prove that **when a student is trained to imitate a teacher that has nearly equivalent parameters, the parameters of the student are pulled toward the parameters of the teacher**. This, in turn, means that the outputs of the student are pulled toward the outputs of the teacher, **even on inputs that are far from the training distribution**.

There are some caveats here (for one, the effect is only observed when the teacher and student have the same base model), but this is, to say the least, a startling finding. I am not enough of a Ph.D. mathematician to know what this means from a deep-in-the-model POV, but as a practitioner of government things, **this is a useful reminder that a lot about how LLMs work, at least in practical application, is unknown**. At least in modern times, I don't think any technology has [reached consumer ubiquity](https://www.hks.harvard.edu/publications/rapid-adoption-generative-ai) at a speed that so far outpaces our fundamental understanding of it. What can we cash that out for? Two things come to mind:

First: "A computer can never be held accountable, therefore a computer must never make a management decision" is as true as ever. It's clear that AI holds tremendous potential for improving the general welfare, in ways big and small. ([Dave Guarino's work at Propel](https://www.propel.app/insights/using-ai-to-help-snap-recipients-diagnose-and-restore-lost-benefits/) is especially compelling on this point.) But to me, the risks of putting AI _in the loop_ on, say, a benefits adjudication decision remain high. Remember [this fun story](https://archive.is/b7jD0)?

>Driggs’s group trained its own model using a data set that contained a mix of scans taken when patients were lying down and standing up. Because patients scanned while lying down were more likely to be seriously ill, the AI learned wrongly to predict serious covid risk from a person’s position. In yet other cases, some AIs were found to be picking up on the text font that certain hospitals used to label the scans. As a result, fonts from hospitals with more serious caseloads became predictors of covid risk.

That was 4 years ago. Since then, LLMs have gotten hundreds? thousands? of times more sophisticated, and they'll get even better faster over the next five years. But the Anthropic study reminds us that things can still go wrong in ways that are unpredictable, possibly undetectable except at the largest scale, and almost certainly undetectable by the people who most need government to work well. If it's true that we _cannot fundamentally know_ what biases we're encoding into decision models, we should feel more confident that we can't consider the [transmission belt of democractic legitimacy](https://repository.law.umich.edu/cgi/viewcontent.cgi?article=1329&context=mjil) to be intact unless there's a human in the loop.

Second: We should be _especially_ hesitant about employing enormous, generic black-box generative AI models that are effectively SaaS products for work in highly specialized or sensitive domains. Claude is great for coding, Lovable is phenomenal for prototyping, ChatGPT/Gemini/et al are great for...most things, honestly. I used Apple's Writing Tools to format the blockquotes in this post! But that's a few light years away from, say, [using AI to analyze and approve new drugs](https://archive.is/bz6FQ):

>Six current and former FDA officials who spoke on the condition of anonymity to discuss sensitive internal work told CNN that Elsa can be useful for generating meeting notes and summaries, or email and communique templates. But it has also made up nonexistent studies, known as AI “hallucinating,” or misrepresented research, according to three current FDA employees and documents seen by CNN. This makes it unreliable for their most critical work, the employees said.

Hallucination is a well-known and increasingly addressable problem, and it's not hard to see how using AI to accelerate the human work of drug approvals could be game-changing. But the Anthropic study tells us that we should pay close attention to the _provenance and process_ around the models we employ for something like this. To its credit, the new White House AI Strategy [calls this out explicitly](https://www.whitehouse.gov/wp-content/uploads/2025/07/Americas-AI-Action-Plan.pdf) (emphasis mine):

> **Encourage Open-Source and Open-Weight AI:** Open-source and open-weight AI models are made freely available by developers for anyone in the world to download and modify. Models distributed this way have unique value for innovation because startups can use them flexibly without being dependent on a closed model provider. They also benefit commercial and government adoption of AI because many businesses and governments have sensitive data that they cannot send to closed model vendors. **And they are essential for academic research, which often relies on access to the weights and training data of a model to perform scientifically rigorous experiments.** We need to ensure America has leading open models founded on American values. Open-source and open-weight models could become global standards in some areas of business and in academic research worldwide. For that reason, they also have geostrategic value. While the decision of whether and how to release an open or closed model is fundamentally up to the developer, the Federal government should create a supportive environment for open models.

TL;DR: Use AI. Not too much. Mostly high-quality, highly transparent models.


















